"use client";
import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { ResourceState, useResource } from "../rep/useResource";
export type Branding = { roundLocationPolicy?: string; layout?: string; displayName: string; accent?: string; primary: string; sidebar: string; background: string; font: string; style: string; logo: string; revision: number };
export const defaultBranding: Branding = { layout: "CLASSIC", displayName: "MedREP", primary: "#167c5a", accent: "#0f766e", sidebar: "#103d30", background: "#f6f8f7", font: "Tahoma", style: "CLASSIC", logo: "", revision: 0 };
const ThemeContext = createContext(defaultBranding);
function foreground(hex: string) {
  const channels = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance = .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  return luminance > .179 ? "#000000" : "#ffffff";
}
export function themeStyle(theme: Branding): CSSProperties {
  const accent = theme.accent ?? "#0f766e";
  return {
    "--accent": accent,
    "--on-accent": foreground(accent),
    "--accent-ink": `color-mix(in srgb, ${accent} 65%, black)`,
    "--accent-soft": `color-mix(in srgb, ${accent} 12%, white)`,
    "--accent-border": `color-mix(in srgb, ${accent} 35%, white)`,
    "--on-primary": foreground(theme.primary), "--on-sidebar": foreground(theme.sidebar),
    "--brand-ink": "#202b38",
    "--brand-soft": `color-mix(in srgb, ${theme.primary} 9%, white)`,
    "--brand-border": "#ccd5df",
    "--brand-muted": "#647080", "--brand-text": "#202b38",
    "--text": "#202b38", "--muted": "#647080", "--surface": "#ffffff",
    "--border": "#ccd5df",
    "--brand-shadow": `0 8px 26px color-mix(in srgb, ${theme.primary} 10%, transparent)`,
    "--primary": theme.primary, "--p": theme.primary, "--brand-primary": theme.primary,
    "--primary-2": `color-mix(in srgb, ${theme.primary} 10%, white)`,
    "--brand-sidebar": theme.sidebar, "--bg": theme.background, "--brand-bg": theme.background,
    "--brand-font": `${theme.font}, sans-serif`, "--brand-radius": theme.style === "SQUARE" ? "4px" : theme.style === "SOFT" ? "28px" : "18px",
    fontFamily: `${theme.font}, sans-serif`, background: theme.background, minHeight: "100vh",
  } as CSSProperties;
}
export function CompanyTheme({ token, children }: { token: string; children: ReactNode }) {
  const resource = useResource<Branding>("/company/branding", token, 30000);
  const title = resource.data?.displayName;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);
  if (!resource.data) return <ResourceState error={resource.error} retry={resource.reload}/>;
  return <ThemeContext.Provider value={resource.data}><div className="company-theme" data-layout={resource.data.layout ?? "CLASSIC"} style={themeStyle(resource.data)}>{children}</div></ThemeContext.Provider>;
}
export function CompanyName() { return <>{useContext(ThemeContext).displayName}</>; }
export function CompanyLogo() {
  const theme = useContext(ThemeContext);
  return theme.logo ? <Image src={theme.logo} alt={theme.displayName} width={40} height={40} unoptimized style={{objectFit:"contain"}}/> : <>{theme.displayName.slice(0,1)}</>;
}
