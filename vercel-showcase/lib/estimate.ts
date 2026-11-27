export const projectTypes = [
 {id:'website',label:'A website that brings in customers',detail:'Company sites, landing pages and online stores.',base:699},
 {id:'software',label:'Software that makes work easier',detail:'Internal tools, dashboards and customer portals.',base:1499},
 {id:'ai',label:'An intelligent workflow',detail:'Knowledge assistants and practical automation.',base:1999},
 {id:'support',label:'Improve an existing product',detail:'Performance, redesign or maintenance.',base:299},
 {id:'explore',label:'I am still exploring',detail:'Let’s find the right starting point.',base:699},
] as const;
export const goals = [{id:'launch',label:'Launch quickly'},{id:'design',label:'Stand out visually'},{id:'operations',label:'Reduce repetitive work'},{id:'conversion',label:'Get more customers'},{id:'scale',label:'Build for growth'}] as const;
export const options = [
 {id:'cms',label:'Manage content',price:250,types:['website','explore','support']},
 {id:'language',label:'Multiple languages',price:150,types:['website','explore','software','support']},
 {id:'booking',label:'Bookings & payments',price:350,types:['website','software','explore']},
 {id:'dashboard',label:'Dashboard & reporting',price:400,types:['software','ai','explore','support']},
 {id:'accounts',label:'User accounts',price:300,types:['website','software','explore']},
 {id:'knowledge',label:'AI knowledge assistant',price:499,types:['ai','software','website','explore']},
 {id:'integration',label:'Connect existing tools',price:350,types:['ai','software','explore','support']},
 {id:'seo',label:'Search visibility',price:150,types:['website','support','explore']},
] as const;
export const stages=[{id:'idea',label:'I have an idea',factor:1.15},{id:'ready',label:'Ready to build',factor:1},{id:'redesign',label:'Replacing an existing system',factor:1.25},{id:'partner',label:'Looking for a technical partner',factor:1.15}] as const;
export type ProjectType=typeof projectTypes[number]['id'];
export type Goal=typeof goals[number]['id'];
export type Feature=typeof options[number]['id'];
export type Stage=typeof stages[number]['id'];
export interface Discovery {type:ProjectType|null;goal:Goal|null;features:Feature[];stage:Stage|null}
export const initialDiscovery:Discovery={type:null,goal:null,features:[],stage:null};
export function availableFeatures(type:ProjectType|null){return options.filter(o=>type!==null&&(o.types as readonly string[]).includes(type));}
export function estimate(input:Discovery){
 const type=projectTypes.find(p=>p.id===input.type),goal=goals.find(g=>g.id===input.goal),stage=stages.find(s=>s.id===input.stage);
 if(!type||!goal||!stage) return null;
 const valid=availableFeatures(type.id).filter(o=>input.features.includes(o.id));
 const base=type.base+valid.reduce((sum,o)=>sum+o.price,0);
 const subtotal=Math.floor((base*Math.round(stage.factor*100)+50)/100);
 const low=Math.floor(subtotal/50)*50;
 const high=Math.ceil(subtotal*(type.id==='explore'?18:13)/500)*50;
 return {low,high,project:type.label,goal:goal.label,stage:stage.label,features:valid.map(o=>o.label),recommendation:({launch:'Start with the essential release, then iterate.',design:'Prioritize a distinct visual direction and accessible interaction.',operations:'Map the manual workflow before choosing automation.',conversion:'Define the customer journey and conversion goals.',scale:'Plan for maintainable architecture and future changes.'})[goal.id]};
}
export const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
