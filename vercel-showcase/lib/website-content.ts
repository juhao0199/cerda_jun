import defaults from './website-defaults.json';
export type WebsiteFields=typeof defaults;
export type SiteCopy=WebsiteFields['copy'];
export type Question=WebsiteFields['faq'][number];
export type PublicWebsiteFields=Omit<WebsiteFields,'focusKeyword'>;
export const websiteDefaults:WebsiteFields=defaults;
export const {focusKeyword: _keyword,...publicDefaults}=defaults;
export const copyGroups=[
  {label:'Homepage',anchor:'home',keys:['heroIntro']},
  {label:'Services',anchor:'services',keys:['servicesHeading','servicesIntro']},
  {label:'Solutions',anchor:'studio-solutions',keys:['solutionsIntro']},
  {label:'Web experiences',anchor:'studio-web',keys:['webHeading','webIntro']},
  {label:'Business software',anchor:'studio-operations',keys:['softwareHeading','softwareIntro']},
  {label:'AI systems',anchor:'studio-knowledge',keys:['aiHeading','aiIntro']},
  {label:'Automation',anchor:'studio-workflows',keys:['automationHeading','automationIntro']},
  {label:'Industries & engineering',anchor:'studio-applications',keys:['industriesHeading','industriesIntro','engineeringHeading','engineeringIntro']},
  {label:'Process',anchor:'process',keys:['processHeading','processIntro']},
  {label:'Insights',anchor:'insights',keys:['insightsHeading','insightsIntro']},
  {label:'About',anchor:'about',keys:['aboutHeading','aboutIntro']},
  {label:'FAQ & guidance',anchor:'faq',keys:['faqHeading','faqIntro','guidanceHeading','guidanceIntro']},
] as const satisfies readonly {label:string;anchor:string;keys:readonly (keyof SiteCopy)[]}[];

export {websiteGraph,safeJsonLd} from './website-schema';
