import { loadTrace, toBlock, sigOf } from './tracecmp.ts';
import { World } from '../src/world.ts';
const tr=loadTrace(process.env.TRACE ?? 'knowledge/refs/lum3ndo-real-trace.txt');
const START=+(process.env.START??197), ON=process.env.START==='248';
const all=new Map(tr.init); for(const t of tr.ticks){ if(t.t>=START)break; for(const [k,c] of t.ch) all.set(k,c); }
const keys=[...all.keys()];
const sg=(c:any)=>{const b=c&&toBlock(c);return b?sigOf(b.type,b.props):''};
const ticks=tr.ticks.filter(t=>t.t>=START&&t.t<START+(+process.env.SPAN||24));
export function evalKnobs(kn:any, off:number){
  const w:any=new World(); w.knobs=kn;
  for(const [k,c] of all){const b=toBlock(c); if(b&&b.type!=='moving_piston'){const [x,y,z]=k.split(',').map(Number); w.setRaw([x,y,z],b.type,b.props);}}
  w.run(2); w.use([103,-8,232]);
  const real=new Map<string,string>(); for(const [k,c] of all) real.set(k,sg(c));
  let simT=0,total=0; const per:number[]=[];
  const cells:string[]=[]; for(let x=97;x<=109;x++)for(let y=-10;y<=1;y++)for(let z=232;z<=237;z++)cells.push(`${x},${y},${z}`);
  for(const t of ticks){ for(const [k,c] of t.ch) real.set(k,sg(c)); const want=t.t-START+off; while(simT<want){w.run(1);simT++;}
    let d=0; for(const k of cells){const [x,y,z]=k.split(',').map(Number); const b=w.get([x,y,z]); const s=sigOf(b.type,b.p as any); if((real.get(k)??'')!==s)d++;} per.push(d); total+=d; }
  return {total,per};
}
if(process.argv[1].endsWith('tracesweep.ts')){
  const combos:any[]=[];
  for(const entitiesFirst of [false,true]) for(const retractBaseSkip of [false,true]) combos.push({entitiesFirst,retractBaseSkip});
  for(const kn of combos) for(const off of [0,1,2]){ const r=evalKnobs(kn,off); console.log(JSON.stringify(kn),'off',off,'total',r.total,'first8',r.per.slice(0,8).join(',')); }
}
