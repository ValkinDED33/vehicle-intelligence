import { useCallback, useEffect, useRef, useState } from "react";
import { assistantApi, type AssistantHistory, type UserLanguage } from "../api";
import { errText } from "../utils/formatters";

export function useAssistantHistory(key: string, vehicleId: string | null, language: UserLanguage, enabled: boolean) {
  const [loaded,setLoaded]=useState<{key:string;history:AssistantHistory}|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const current=useRef(key),generation=useRef(0);
  current.current=key;
  const apply=useCallback((history:AssistantHistory)=>{
    if(current.current!==key)return;
    generation.current++;setLoaded({key,history});setError(null);setLoading(false);
  },[key]);
  const refresh=useCallback(async()=>{
    if(current.current!==key)return;
    const version=++generation.current;setLoading(true);setError(null);
    try {
      const history=await assistantApi.history(vehicleId,language);
      if(current.current===key&&generation.current===version)apply(history);
    } catch(err){if(current.current===key&&generation.current===version)setError(errText(err));}
    finally{if(current.current===key&&generation.current===version)setLoading(false);}
  },[key,vehicleId,language,apply]);
  useEffect(()=>{
    if(!enabled)return;
    void refresh();
    const focus=()=>void refresh();window.addEventListener('focus',focus);
    return()=>{generation.current++;window.removeEventListener('focus',focus);};
  },[enabled,refresh]);
  const clear=async()=>{
    const version=++generation.current;setLoading(true);setError(null);
    try {const history=await assistantApi.clearHistory(vehicleId,language);if(current.current===key&&generation.current===version)apply(history);}
    catch(err){if(current.current===key&&generation.current===version)setError(errText(err));}
    finally{if(current.current===key&&generation.current===version)setLoading(false);}
  };
  const history=loaded?.key===key?loaded.history:null;
  return {messages:history?.messages??[],epoch:history?.epoch??0,loading:enabled&&(loading||!history&&!error),error,apply,refresh,clear};
}
