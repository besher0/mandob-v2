import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/browser/[...path]/route";

test("browser session proxy hides tokens, rejects foreign writes, restores, renews and logs out", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url=String(input); calls.push(url);
    if(url.endsWith("/auth/login") || url.endsWith("/auth/refresh")) return Response.json({accessToken:"secret-access",refreshToken:"secret-refresh",user:{id:"u"}});
    if(url.endsWith("/auth/me")) {
      if(new Headers(init?.headers).get("Authorization")!=="Bearer secret-access") return new Response(null,{status:401});
      return Response.json({id:"u"});
    }
    if(url.endsWith("/auth/logout")) {
      assert.equal(JSON.parse(String(init?.body)).refreshToken,"secret-refresh");
      return Response.json({success:true});
    }
    return Response.json({});
  };
  const context=(path:string)=>({params:Promise.resolve({path:path.split("/")})});
  const req=(path:string,method="GET",cookie="",origin="http://localhost:3100")=>new NextRequest("http://localhost:3100/api/browser/"+path,{
    method,headers:{origin,cookie,"content-type":"application/json"},...(method==="POST"?{body:"{}"}:{})
  });
  try {
    const denied=await POST(req("auth/login","POST","","https://foreign.example"),context("auth/login"));
    assert.equal(denied.status,403);assert.equal(calls.length,0);
    const login=await POST(req("auth/login","POST"),context("auth/login"));
    const body=await login.text();
    assert.ok(!body.includes("secret-"));
    assert.match(login.headers.get("set-cookie")!,/HttpOnly/);
    assert.match(login.headers.get("set-cookie")!,/SameSite=strict/i);
    const cookies="medrep_access=secret-access; medrep_refresh=secret-refresh";
    const restored=await GET(req("auth/session","GET",cookies),context("auth/session"));
    assert.equal((await restored.json()).user.id,"u");
    const renewed=await GET(req("auth/session","GET","medrep_access=expired; medrep_refresh=secret-refresh"),context("auth/session"));
    assert.equal(renewed.status,200);assert.ok(renewed.headers.get("set-cookie"));
    assert.ok(!(await renewed.text()).includes("secret-"));
    const refreshBlocked=await POST(req("auth/refresh","POST",cookies),context("auth/refresh"));
    assert.equal(refreshBlocked.status,404);
    const logout=await POST(req("auth/logout","POST",cookies),context("auth/logout"));
    assert.match(logout.headers.get("set-cookie")!,/Max-Age=0/);
    const anonymous=await GET(req("auth/session"),context("auth/session"));
    assert.equal(anonymous.status,401);
  } finally { globalThis.fetch=original; }
});

test("concurrent expired requests share one refresh and do not share another account's session", async () => {
  const original = globalThis.fetch;
  let refreshes = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/auth/refresh")) {
      refreshes++;
      const old = JSON.parse(String(init?.body)).refreshToken;
      await new Promise(resolve => setTimeout(resolve, 20));
      return Response.json({accessToken:"new-"+old,refreshToken:"rotated-"+old,user:{id:old}});
    }
    const token = new Headers(init?.headers).get("Authorization") ?? "";
    if (!token.startsWith("Bearer new-")) return new Response(null,{status:401});
    return Response.json({id:token.slice("Bearer new-".length)});
  };
  const call = (account:string) => GET(new NextRequest("http://localhost:3100/api/browser/auth/session", {
    headers:{cookie:`medrep_access=expired; medrep_refresh=${account}`}
  }), {params:Promise.resolve({path:["auth","session"]})});
  try {
    const responses=await Promise.all([...Array.from({length:20},()=>call("concurrent-a")),call("concurrent-b")]);
    assert.equal(refreshes,2);
    for(let i=0;i<responses.length;i++) {
      assert.equal(responses[i].status,200);
      assert.equal((await responses[i].json()).user.id,i===20?"concurrent-b":"concurrent-a");
    }
  } finally { globalThis.fetch=original; }
});

test("upstream outage keeps cookies; authentication rejection clears them", async () => {
  const original=globalThis.fetch;
  const call=(refresh:string)=>GET(new NextRequest("http://localhost:3100/api/browser/auth/session",{
    headers:{cookie:`medrep_access=expired; medrep_refresh=${refresh}`}
  }),{params:Promise.resolve({path:["auth","session"]})});
  try {
    globalThis.fetch=async input=>new Response(null,{status:String(input).endsWith("/auth/refresh")?503:401});
    const outage=await call("outage-test");
    assert.equal(outage.status,503);
    assert.equal(outage.headers.get("set-cookie"),null);
    globalThis.fetch=async ()=>new Response(null,{status:401});
    const rejected=await call("revoked-test");
    assert.equal(rejected.status,401);
    assert.match(rejected.headers.get("set-cookie")!,/Max-Age=0/);
  } finally { globalThis.fetch=original; }
});

test("multipart writes and binary downloads preserve bytes and do not retry on 403", async () => {
  const original=globalThis.fetch;
  let calls=0;
  const bytes=new Uint8Array([0,255,13,10,42]);
  globalThis.fetch=async (_input,init)=>{
    calls++;
    assert.equal(new Headers(init?.headers).get("content-type"),"multipart/form-data; boundary=test");
    assert.deepEqual(new Uint8Array(init?.body as ArrayBuffer),bytes);
    return new Response(bytes,{headers:{"content-type":"application/octet-stream","content-disposition":'attachment; filename="test.xlsx"'}});
  };
  const req=()=>new NextRequest("http://localhost:3100/api/browser/manager/doctors/import",{
    method:"POST",headers:{origin:"http://localhost:3100",cookie:"medrep_access=test","content-type":"multipart/form-data; boundary=test"},body:bytes
  });
  const context={params:Promise.resolve({path:["manager","doctors","import"]})};
  try {
    const response=await POST(req(),context);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
    assert.match(response.headers.get("content-disposition")!,/test.xlsx/);
    globalThis.fetch=async ()=>{calls++;return new Response(null,{status:403});};
    assert.equal((await POST(req(),context)).status,403);
    assert.equal(calls,2);
  } finally {globalThis.fetch=original;}
});

test("tab scopes isolate credentials, logout and cookie paths", async () => {
  const original = globalThis.fetch;
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const cookie = `medrep_access=legacy; medrep_access_${a}=manager; medrep_refresh_${a}=manager-refresh; medrep_access_${b}=rep; medrep_refresh_${b}=rep-refresh`;
  const call = (scope: string, endpoint: string, method = "GET", cookies = cookie) => {
    const path = `__session/${scope}/auth/${endpoint}`;
    const req = new NextRequest("http://localhost:3100/api/browser/" + path, {
      method, headers: {cookie: cookies, origin: "http://localhost:3100"},
      ...(method === "POST" ? {body: "{}"} : {}),
    });
    return (method === "GET" ? GET : POST)(req, {params: Promise.resolve({path: path.split("/")})});
  };
  globalThis.fetch = async (url, init) => {
    assert.ok(!String(url).includes("__session"));
    if (String(url).endsWith("/auth/logout")) {
      assert.equal(JSON.parse(String(init?.body)).refreshToken, "rep-refresh");
      return Response.json({});
    }
    if (String(url).endsWith("/auth/login")) return Response.json({accessToken:"new",refreshToken:"new-refresh",user:{id:"rep"}});
    return Response.json({id: new Headers(init?.headers).get("authorization")});
  };
  try {
    assert.equal((await (await call(a, "session")).json()).user.id, "Bearer manager");
    assert.equal((await (await call(b, "session")).json()).user.id, "Bearer rep");
    const logout = await call(b, "logout", "POST");
    assert.ok(logout.headers.get("set-cookie")!.includes(`medrep_access_${b}=`));
    assert.ok(!logout.headers.get("set-cookie")!.includes(a));
    assert.equal((await (await call(a, "session")).json()).user.id, "Bearer manager");
    const login = await call(b, "login", "POST");
    assert.ok(login.headers.get("set-cookie")!.includes(`Path=/api/browser/__session/${b}`));
    assert.ok(login.headers.get("set-cookie")!.includes("HttpOnly"));
    assert.equal((await call(b, "session", "GET", "medrep_access=legacy")).status, 401);
    assert.equal((await call("invalid", "session")).status, 400);
  } finally { globalThis.fetch = original; }
});
