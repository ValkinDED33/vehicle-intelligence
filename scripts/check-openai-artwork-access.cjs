// Read-only model access check. Never generates images or prints credentials/provider bodies.
require('dotenv').config({quiet:true});
(async()=>{
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key){console.log(JSON.stringify({configured:false}));process.exitCode=1;return;}
  try{
    const response=await fetch('https://api.openai.com/v1/models/gpt-image-2',{
      headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000),redirect:'error',
    });
    let available=false;
    if(response.ok){const body=await response.json();available=body.id==='gpt-image-2';}
    else await response.body?.cancel();
    console.log(JSON.stringify({configured:true,status:response.status,modelVisible:available,generationPerformed:false}));
    if(!available)process.exitCode=1;
  }catch{console.log(JSON.stringify({configured:true,connected:false,generationPerformed:false}));process.exitCode=1;}
})();
