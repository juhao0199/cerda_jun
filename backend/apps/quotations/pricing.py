"""Canonical quote data and currency arithmetic. Never accept client totals."""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date
import re

CURRENCIES = ('USD','THB','SGD','EUR','GBP','AUD','NZD','AED')
FIELDS = {'title','currency','validUntil','items','discount','tax','paymentTerms','notes'}
CATALOG = [
    {'code':'web','name':'Website design & development'},
    {'code':'software','name':'Custom software development'},
    {'code':'ai','name':'AI integration & automation'},
    {'code':'maintenance','name':'Maintenance & support'},
    {'code':'discovery','name':'Technical discovery & consultation'},
]


def text(value, limit, required=False):
    if not isinstance(value,str) or len(value)>limit or any(ord(c)<32 and c not in '\n\r\t' for c in value):
        raise ValueError('Invalid text field.')
    value.encode('utf-8')
    value=value.strip()
    if required and not value: raise ValueError('Required text is missing.')
    return value


def decimal(value, maximum):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9]{1,9}(?:\.[0-9]{1,2})?',value):
        raise ValueError('Use decimal numbers with up to two decimal places.')
    n=Decimal(value)
    if n>maximum: raise ValueError('Amount exceeds limit.')
    return n


def money(n):
    return format(n.quantize(Decimal('.01'), rounding=ROUND_HALF_UP),'f')


def normalize(data):
    if not isinstance(data,dict) or set(data)!=FIELDS: raise ValueError('Invalid quotation fields.')
    currency=data['currency']
    if currency not in CURRENCIES: raise ValueError('Invalid currency.')
    raw_date=data['validUntil']
    if not isinstance(raw_date,str): raise ValueError('Invalid expiry date.')
    expiry=date.fromisoformat(raw_date)
    if expiry.isoformat()!=raw_date or not 1900<=expiry.year<=9998: raise ValueError('Invalid expiry date.')
    items=data['items']
    if not isinstance(items,list) or not 1<=len(items)<=12: raise ValueError('Add between 1 and 12 items.')
    lines=[]; subtotal=Decimal(0)
    for item in items:
        if not isinstance(item,dict) or set(item)!={'description','quantity','unitPrice'}: raise ValueError('Invalid line item.')
        quantity=decimal(item['quantity'],Decimal('10000'))
        if quantity<=0: raise ValueError('Quantity must be positive.')
        price=decimal(item['unitPrice'],Decimal('9999999.99'))
        total=money(quantity*price); subtotal+=Decimal(total)
        lines.append({'description':' '.join(text(item['description'],180,True).split()),'quantity':money(quantity),'unitPrice':money(price),'total':total})
    discount=decimal(data['discount'],Decimal(100)); tax=decimal(data['tax'],Decimal(100))
    discounted=Decimal(money(subtotal*discount/100)); base=subtotal-discounted
    tax_amount=Decimal(money(base*tax/100))
    return {'title':text(data['title'],120,True),'currency':currency,'validUntil':raw_date,'items':lines,
            'discount':money(discount),'tax':money(tax),'paymentTerms':text(data['paymentTerms'],600,True),'notes':text(data['notes'],600),
            'subtotal':money(subtotal),'discountAmount':money(discounted),'taxAmount':money(tax_amount),'total':money(base+tax_amount)}


def editable(snapshot):
    result={k:snapshot[k] for k in FIELDS}
    result['items']=[{k:item[k] for k in ('description','quantity','unitPrice')} for item in snapshot['items']]
    return result
