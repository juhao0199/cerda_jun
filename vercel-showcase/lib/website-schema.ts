import type {PublicWebsiteFields} from './website-content';
export function websiteGraph(fields:PublicWebsiteFields,origin:string){
  const url=new URL('/',origin).href, org=url+'#organization';
  const graph:Record<string,unknown>[]=[
    {'@type':'Organization','@id':org,name:'Cedar & Cursor',url,description:fields.copy.aboutIntro,logo:{'@type':'ImageObject',url:url+'logo.svg'},email:'jun@cedarandcursor.com'},
    {'@type':'WebSite','@id':url+'#website',url,name:'Cedar & Cursor',publisher:{'@id':org}},
    {'@type':'WebPage','@id':url+'#webpage',url,name:fields.homeTitle,description:fields.homeDescription,isPartOf:{'@id':url+'#website'}},
  ];
  if(fields.serviceSchema){
    for(const [name,id,description] of [
      ['Web experiences','studio-web',fields.copy.webIntro],['Business software','studio-operations',fields.copy.softwareIntro],['AI systems','studio-knowledge',fields.copy.aiIntro],['Automation','studio-workflows',fields.copy.automationIntro],
    ])graph.push({'@type':'Service','@id':url+'#'+id,url:url+'#'+id,name,description,provider:{'@id':org}});
  }
  if(fields.faqSchema)graph.push({'@type':'FAQPage','@id':url+'#faq',mainEntity:[...fields.faq,...fields.guidance].map(q=>({'@type':'Question',name:q.question,acceptedAnswer:{'@type':'Answer',text:q.answer}}))});
  return {'@context':'https://schema.org','@graph':graph};
}
export function safeJsonLd(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c');}
