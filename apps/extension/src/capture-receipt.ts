import {IdSchema} from '@beforeyou/contracts';
import type {PageState} from './config';

export function capturedPageUrl(value:string):string{const url=new URL(value);return url.origin+url.pathname;}
export function captureReceiptKey(ownerId:string,pageUrl:string):string{return `beforeyou.capture.${ownerId}.${encodeURIComponent(capturedPageUrl(pageUrl))}`;}

/** Only identifiers and page metadata survive popup/worker restarts; evidence and judgments are reloaded from the owner API. */
export function captureReceipt(state:PageState){
 if(!state.ownerId||!state.pageUrl||!state.caseId||!state.runId||!state.captureId||!state.sourceEventId)return null;
 return {ownerId:state.ownerId,pageUrl:capturedPageUrl(state.pageUrl),caseId:state.caseId,runId:state.runId,captureId:state.captureId,sourceEventId:state.sourceEventId,association:state.association,caseTitle:state.caseTitle};
}
export function restoreCaptureReceipt(value:unknown,ownerId:string,pageUrl:string):PageState|undefined{
 if(!value||typeof value!=='object')return;
 const stored=value as Record<string,unknown>;
 if(stored.ownerId!==ownerId||stored.pageUrl!==capturedPageUrl(pageUrl))return;
 for(const key of ['caseId','runId','captureId','sourceEventId'])if(!IdSchema.safeParse(stored[key]).success)return;
 if(stored.association!=='standalone'&&stored.association!=='linked_email')return;
 return {ownerId,pageUrl:stored.pageUrl as string,caseId:stored.caseId as string,runId:stored.runId as string,captureId:stored.captureId as string,sourceEventId:stored.sourceEventId as string,association:stored.association,caseTitle:typeof stored.caseTitle==='string'?stored.caseTitle.slice(0,1000):undefined,phase:'checking',message:'Loading the saved check status…'};
}
