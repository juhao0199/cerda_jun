export function monthDays(month:string){
  const date=new Date(`${month}-01T00:00:00Z`);
  const year=date.getUTCFullYear(),m=date.getUTCMonth();
  const days=new Date(Date.UTC(year,m+1,0)).getUTCDate();
  const offset=(date.getUTCDay()+6)%7;
  return [...Array.from({length:offset},()=>null),...Array.from({length:days},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)];
}
export function shiftMonth(month:string,delta:number){
  const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7);
}
export function calendarDate(scheduledAt:string|null,publishedAt:string|null,status:string){
  const value=status==='published'?publishedAt:scheduledAt;
  return value?new Date(value).toISOString().slice(0,10):null;
}
export function utcSchedule(value:string){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const date=new Date(value+'Z');return Number.isNaN(date.getTime())||date.toISOString().slice(0,16)!==value?null:date.toISOString();
}
