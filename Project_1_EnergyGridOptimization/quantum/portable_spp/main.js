import * as runner from 'portable.runner';
import {render,showError} from './view.js';
try {
 const value=await runner.run.callPromising(backend,256,2026,1,1,40);
 const result=JSON.parse(typeof value==='string'?value:value.toJs());
 render(result);
 console.log(JSON.stringify(result));
} catch(error) { showError(String(error)); throw error; }
