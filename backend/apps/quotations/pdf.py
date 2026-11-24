"""Render an immutable snapshot; no templates, URLs or user-controlled markup."""
from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable


class BrandMark(Flowable):
    """Vector reproduction of frontend/public/logo.svg on the studio dark tile."""
    def __init__(self):
        super().__init__()
        self.width = self.height = 36

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(colors.HexColor('#111113'))
        c.roundRect(0, 0, 36, 36, 6, stroke=0, fill=1)
        # SVG viewBox 0 0 40 40, scaled to 30pt, with inverted y-axis.
        c.translate(3, 33)
        c.scale(.75, -.75)
        def path(points):
            p = c.beginPath()
            p.moveTo(*points[0])
            for point in points[1:]:
                p.lineTo(*point)
            p.close()
            return p
        c.setFillColor(colors.HexColor('#f5f5f5'))
        c.drawPath(path([(20,2),(32,17),(26,17),(36,30),(23,30),(23,38),
                         (17,38),(17,30),(4,30),(14,17),(8,17)]), stroke=0, fill=1)
        c.setFillColor(colors.HexColor('#111113'))
        c.setStrokeColor(colors.HexColor('#f5f5f5'))
        c.setLineWidth(1.2)
        c.drawPath(path([(20,18),(35,30),(27,31),(24,38)]), stroke=1, fill=1)
        c.restoreState()


def render(number, version, status, s):
    # Standard PDF fonts are Latin/WinAnsi. Fail explicitly rather than corrupt names.
    def p(value, style):
        value=str(value or '')
        value.encode('cp1252')
        return Paragraph(escape(value).replace('\n','<br/>'),style)
    ink=colors.HexColor('#222222'); gray=colors.HexColor('#666666')
    body=ParagraphStyle('body',fontName='Helvetica',fontSize=10,leading=15,textColor=ink,splitLongWords=True)
    small=ParagraphStyle('small',parent=body,fontSize=9,leading=13,textColor=gray)
    heading=ParagraphStyle('title',parent=body,fontName='Helvetica-Bold',fontSize=24,leading=29)
    label=ParagraphStyle('label',parent=body,fontName='Helvetica-Bold',fontSize=11,leading=16)
    right=ParagraphStyle('right',parent=body,alignment=2)
    total_style=ParagraphStyle('total',parent=label,alignment=2,fontSize=14,leading=22)
    out=BytesIO(); doc=SimpleDocTemplate(out,pagesize=A4,leftMargin=42,rightMargin=42,topMargin=42,bottomMargin=48,title='Cedar & Cursor quotation')
    c=s['recipient']; currency=s['currency']
    brand = Table([[BrandMark(), [p('CEDAR & CURSOR', label), p('Digital Technology Studio', small)]]],
                  colWidths=[47, 451], hAlign='LEFT')
    brand.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                              ('LEFTPADDING',(0,0),(-1,-1),0),
                              ('RIGHTPADDING',(0,0),(-1,-1),0),
                              ('TOPPADDING',(0,0),(-1,-1),0),
                              ('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story=[brand,Spacer(1,20),p('Quotation',heading),p(f'{number}  |  Revision {version}  |  {status.upper()}',small),Spacer(1,16),p(s['title'],label),p('Prepared for',small),p(c.get('name'),body),p(c.get('company'),body),p(c.get('email'),body),p('Valid until: '+s['validUntil'],small),Spacer(1,18)]
    rows=[[p(x,label) for x in ('Service / deliverable','Qty','Unit price','Amount')]]
    for line in s['items']:
        rows.append([p(line['description'],body),p(line['quantity'],right),p(line['unitPrice'],right),p(line['total'],right)])
    table=Table(rows,colWidths=[220,48,105,125],repeatRows=1,hAlign='LEFT')
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eeeeee')),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#dddddd')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
    story.extend([table,Spacer(1,14)])
    for title,key in [('Subtotal','subtotal'),('Discount','discountAmount'),('Tax','taxAmount'),('Total','total')]:
        story.append(p(f'{title}: {currency} {s[key]}',total_style if key=='total' else right))
    story.extend([Spacer(1,18),p('Payment terms',label),p(s['paymentTerms'],body),Spacer(1,10),p('Notes',label),p(s['notes'] or '—',body)])
    def footer(canvas,doc):
        canvas.setFont('Helvetica',8); canvas.setFillColor(gray); canvas.drawString(42,26,'Rooted in craft. Built for tomorrow.');canvas.drawRightString(A4[0]-42,26,str(doc.page))
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return out.getvalue()
