let transformer;
let current;
let pipe;
let busy=false;
self.onmessage=async({data})=>{
  if(busy){self.postMessage({type:'error',message:'Inferenza già in corso.'});return;}
  busy=true;
  try{
    if(!transformer){
      transformer=await import('/vendor/transformers.min.js');
      transformer.env.allowRemoteModels=false;
      transformer.env.allowLocalModels=true;
      transformer.env.localModelPath='/models/';
      transformer.env.useBrowserCache=false;
      transformer.env.backends.onnx.wasm.wasmPaths='/vendor/';
      transformer.env.backends.onnx.wasm.numThreads=1;
    }
    if(current!==data.model.id){
      if(pipe)await pipe.dispose();pipe=null;current=null;
      self.postMessage({type:'status',message:'Caricamento del modello locale…'});
      pipe=await transformer.pipeline(data.model.task,data.model.repo,{device:'wasm',dtype:data.model.dtype});
      current=data.model.id;
    }
    self.postMessage({type:'status',message:data.model.category==='speech'?'Trascrizione sul dispositivo…':'Elaborazione locale…'});
    let text;
    if(data.model.category==='speech'){
      const options={task:'transcribe',chunk_length_s:30,stride_length_s:5};
      if(data.language!=='auto')options.language=data.language;
      const result=await pipe(data.audio,options);text=result.text;
    }else{
      const messages=[{role:'system',content:'Return only the requested rewritten text. Preserve facts. Do not invent details.'},{role:'user',content:`${data.instruction}\n\n${data.text}`}];
      const result=await pipe(messages,{max_new_tokens:256,do_sample:false,return_full_text:false});
      const generated=result[0].generated_text;
      text=typeof generated==='string'?generated:generated.at(-1).content;
    }
    self.postMessage({type:'result',text:text.trim()});
  }catch(e){self.postMessage({type:'error',message:e.message});}
  finally{busy=false;}
};
