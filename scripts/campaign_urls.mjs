#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const ORIGIN='https://k4-technology.com';
const REQUIRED_UTM=['utm_source','utm_medium','utm_campaign','utm_content'];
const OPTIONAL_UTM=['utm_term'];
const ALLOWED_UTM=new Set([...REQUIRED_UTM,...OPTIONAL_UTM]);
const SNAKE_CASE=/^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export const buildCampaignUrl=campaign=>{
  const url=new URL(campaign.path,ORIGIN);
  for(const key of [...REQUIRED_UTM,...OPTIONAL_UTM]){
    if(campaign[key])url.searchParams.set(key,campaign[key]);
  }
  return url;
};

export const validateCampaignUrl=(input,expected={})=>{
  const url=input instanceof URL?input:new URL(input,ORIGIN);
  const errors=[];
  if(url.origin!==ORIGIN)errors.push(`unexpected origin: ${url.origin}`);
  if(url.href.includes('amp;utm_'))errors.push('literal amp;utm_ found in browser URL');
  for(const [key,value] of url.searchParams){
    if(key.startsWith('amp;utm_'))errors.push(`HTML entity leaked into parameter name: ${key}`);
    if(key.startsWith('utm_')&&!ALLOWED_UTM.has(key))errors.push(`unknown UTM parameter: ${key}`);
    if(ALLOWED_UTM.has(key)&&!SNAKE_CASE.test(value))errors.push(`${key} must be lowercase snake_case: ${value}`);
    if(ALLOWED_UTM.has(key)&&/@/.test(value))errors.push(`${key} must not contain an email address`);
  }
  for(const key of REQUIRED_UTM){
    const values=url.searchParams.getAll(key);
    if(values.length===0)errors.push(`missing ${key}`);
    if(values.length>1)errors.push(`duplicate ${key}`);
    if(expected[key]&&values[0]!==expected[key])errors.push(`${key} does not match campaign definition`);
  }
  return errors;
};

export const validateCampaign=campaign=>{
  const errors=[];
  if(!campaign.name||!SNAKE_CASE.test(campaign.name))errors.push('name must be lowercase snake_case');
  if(!campaign.path?.startsWith('/'))errors.push('path must be root-relative');
  const url=buildCampaignUrl(campaign);
  return {name:campaign.name,url:url.href,errors:[...errors,...validateCampaignUrl(url,campaign)]};
};

const isCli=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const file=process.argv[2]?resolve(process.cwd(),process.argv[2]):resolve(root,'campaigns/campaign_urls.json');
  const campaigns=JSON.parse(await readFile(file,'utf8'));
  const results=campaigns.map(validateCampaign);
  for(const result of results){
    if(result.errors.length){
      for(const error of result.errors)console.error(`ERROR ${result.name||'(unnamed)'}: ${error}`);
    }else{
      console.log(`OK ${result.name}: ${result.url}`);
    }
  }
  if(results.some(result=>result.errors.length))process.exitCode=1;
}
