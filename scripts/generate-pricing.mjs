import fs from 'node:fs';
import {projectTypes,goals,options,stages,estimate} from '../frontend/lib/estimate.ts';
const catalog={projectTypes,goals,options,stages};
const fixtures=[];
for(const type of projectTypes) for(const goal of goals) for(const stage of stages){
 const allowed=options.filter(o=>o.types.includes(type.id)).map(o=>o.id);
 for(let mask=0;mask<2**allowed.length;mask++){
  const input={type:type.id,goal:goal.id,stage:stage.id,features:allowed.filter((_,i)=>mask&(1<<i))};
  fixtures.push({input,expected:estimate(input)});
 }
}
for(const [file,data] of [['../backend/apps/inquiries/pricing.json',catalog],['../backend/tests/pricing-fixtures.json',fixtures]]){
 const url=new URL(file,import.meta.url); const content=JSON.stringify(data)+(file.includes('fixtures')?'\n':'\n');
 if(process.argv.includes('--check')){
  if(JSON.stringify(JSON.parse(fs.readFileSync(url,'utf8')))!==JSON.stringify(data))throw Error('Pricing drift: '+file);
 }else fs.writeFileSync(url,file.includes('fixtures')?content:JSON.stringify(data,null,2)+'\n');
}
