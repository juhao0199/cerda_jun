// Preview only. Django independently validates and persists authoritative totals.
const hundred=BigInt(100), tenThousand=BigInt(10000), zero=BigInt(0);
function parse(value:string,max:bigint){if(!/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(value))throw new Error('Invalid decimal');const [a,b='']=value.split('.');const n=BigInt(a)*hundred+BigInt(b.padEnd(2,'0'));if(n>max)throw new Error('Out of range');return n;}
const rounded=(n:bigint,d:bigint)=>(n+d/BigInt(2))/d;
const format=(n:bigint)=>`${n/hundred}.${String(n%hundred).padStart(2,'0')}`;
export function previewTotals(items:{quantity:string;unitPrice:string}[],discount:string,tax:string){
  try{if(!items.length||items.length>12)return null;let subtotal=zero;for(const item of items){const q=parse(item.quantity,BigInt(1000000));if(q<=zero)return null;subtotal+=rounded(q*parse(item.unitPrice,BigInt(999999999)),hundred);}const off=rounded(subtotal*parse(discount,tenThousand),tenThousand);const taxAmount=rounded((subtotal-off)*parse(tax,tenThousand),tenThousand);return {subtotal:format(subtotal),discountAmount:format(off),taxAmount:format(taxAmount),total:format(subtotal-off+taxAmount)};}catch{return null;}
}
