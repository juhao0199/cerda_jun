export const stages=['idea','research','writing','optimizing','ready','archived'] as const;
export type Stage=typeof stages[number];
export const lanes=['idea','research','writing','optimizing','ready','scheduled','published','archived'] as const;
export const stageLabels:Record<typeof lanes[number],string>={idea:'Ideas',research:'Research',writing:'Writing',optimizing:'Optimizing',ready:'Ready for review',scheduled:'Scheduled',published:'Published',archived:'Archived'};
export function lane(t:{stage:Stage;release:string}):typeof lanes[number]{return t.stage==='archived'?'archived':t.release==='scheduled'?'scheduled':t.release==='published'?'published':t.stage;}
export function overdue(t:{due:string|null;stage:Stage;release:string},today:string){return Boolean(t.due&&t.due<today&&lane(t)!=='published'&&lane(t)!=='archived');}
export function localDay(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
