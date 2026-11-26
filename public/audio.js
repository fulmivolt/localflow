export function resample(input, from, to=16000){
  if(from===to)return input;
  // Average source bins when downsampling, reducing aliasing versus point sampling.
  const ratio=from/to, output=new Float32Array(Math.floor(input.length/ratio));
  for(let i=0;i<output.length;i++){
    const start=i*ratio,end=(i+1)*ratio;let sum=0;
    for(let j=Math.floor(start);j<Math.ceil(end);j++)sum+=(input[j]||0)*Math.max(0,Math.min(end,j+1)-Math.max(start,j));
    output[i]=sum/ratio;
  }
  return output;
}
export class Recorder {
  chunks=[];length=0;peak=0;
  async start(device,level,onEnded){
    try{
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:device?{exact:device}:undefined,channelCount:1,noiseSuppression:true}});
      this.stream.getAudioTracks()[0].onended=onEnded;
      this.context=new AudioContext();await this.context.resume();
      await this.context.audioWorklet.addModule('/capture-worklet.js');
      this.source=this.context.createMediaStreamSource(this.stream);
      this.node=new AudioWorkletNode(this.context,'localflow-capture');
      this.node.port.onmessage=({data})=>{
        this.chunks.push(data);this.length+=data.length;
        const rms=Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);this.peak=Math.max(this.peak,rms);level(Math.min(1,rms*10));
      };
      this.source.connect(this.node);this.node.connect(this.context.destination);
    }catch(e){await this.cancel();throw e;}
  }
  async cancel(){
    this.source?.disconnect();this.node?.disconnect();
    if(this.node)this.node.port.onmessage=null;
    this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});
    if(this.context&&this.context.state!=='closed')await this.context.close();
    this.chunks=[];
  }
  async stop(){
    const rate=this.context.sampleRate, chunks=this.chunks, length=this.length;
    await this.cancel();const samples=new Float32Array(length);let offset=0;
    for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length;}
    return resample(samples,rate);
  }
}
