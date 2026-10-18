import type { PageBundle } from '@beforeyou/contracts';

/** Select rendered, on-screen text. No DOM cloning, HTML, attributes, storage, cookies or control values are serialized. */
export function collectVisiblePage(doc:Document,win:Window,redact:(text:string)=>string):PageBundle {
 const root=doc.querySelector('main,article,form')??doc.body;
 if(!root)throw new Error('This page has no visible content to capture.');
 const excluded='script,style,noscript,template,input,textarea,select,option,[contenteditable],[hidden],[aria-hidden="true"],[inert]';
 function visible(el:Element):boolean{
  if(el.closest(excluded))return false;
  for(let parent:Element|null=el;parent;parent=parent.parentElement){const style=win.getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0||parent.hasAttribute('hidden')||parent.getAttribute('aria-hidden')==='true')return false;}
  return [...el.getClientRects()].some(rect=>rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<win.innerHeight&&rect.left<win.innerWidth);
 }
 function clean(text:string){return redact(text).replace(/\s+/g,' ').trim();}
 const groups=new Map<Element,string[]>();const textNodes:string[]=[];let length=0;
 const walker=doc.createTreeWalker(root,4);let node:Node|null;
 while((node=walker.nextNode())){
  const parent=node.parentElement;if(!parent||!visible(parent))continue;
  const text=clean(node.textContent??'');if(!text)continue;
  const remaining=8000-length;if(remaining<=0)break;
  const selected=text.slice(0,remaining);textNodes.push(selected);length+=selected.length+1;
  const block=parent.closest('h1,h2,h3,h4,h5,h6,p,li,label,tr,dt,dd')??parent;
  const values=groups.get(block)??[];values.push(selected);groups.set(block,values);
 }
 const visibleText=textNodes.join(' ');
 const fieldLabels=[...root.querySelectorAll('label')].filter(visible).map(el=>clean([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent??'').join(' '))||clean(groups.get(el)?.join(' ')??'')).filter(Boolean).map(s=>s.slice(0,200)).slice(0,100);
 const blocks:PageBundle['blocks']=[];
 for(const [el,values]of groups){if(blocks.length>=150)break;const text=values.join(' ').slice(0,2000);if(!text||!visibleText.includes(text))continue;const tag=el.tagName;const kind=tag==='LABEL'?'field_label':/^H[1-6]$/.test(tag)?'heading':tag==='LI'?'list_item':tag==='TR'?'table_row':'paragraph';blocks.push({kind,text});}
 const url=new URL(win.location.href);url.search='';url.hash='';url.username='';url.password='';
 return {schemaVersion:'1',pageUrl:url.href,title:clean(doc.title).slice(0,300),capturedAt:new Date().toISOString(),visibleText,blocks,fieldLabels,viewport:{width:win.innerWidth,height:win.innerHeight}};
}
