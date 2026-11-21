import {it,expect} from 'vitest';
import {isWriteConflict} from '../src/database/write-conflict.js';
it('retries only recognized database write conflicts',()=>{
 expect(isWriteConflict({code:'P2034'})).toBe(true);
 expect(isWriteConflict({name:'DriverAdapterError',cause:{kind:'TransactionWriteConflict'}})).toBe(true);
 for(const error of [null,new Error('TransactionWriteConflict'),{code:'P2002'},{name:'DriverAdapterError',cause:{kind:'AuthenticationFailed'}}])expect(isWriteConflict(error)).toBe(false);
});
