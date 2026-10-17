import {calculatePanel} from './formulas.mjs';
self.onmessage=e=>{const {id,panel,series}=e.data;try{self.postMessage({id,result:calculatePanel(panel,series)});}catch(error){self.postMessage({id,error:error.message});}};
