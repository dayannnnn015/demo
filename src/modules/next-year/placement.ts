// Next year's classes, drawn from a seed. Who moves up is the school's
// approved outcome, a promotion or conditional promotion, and nothing here changes it: the draw only decides which
// section of the grade each learner joins. The same seed over the same records
// always gives the same classes, and each grade is drawn on its own, so a
// preview of one grade matches that grade in the whole school's.
import {createHash} from 'node:crypto';

type Sex='male'|'female';
export type Source={
  source_year:{id:string;start_year:number;status:string};
  target_year:{id:string;start_year:number;starts_on:string;status:string};
  learners:{enrollment_id:string;learner_id:string;first_name:string;middle_name:string|null;last_name:string;name_extension:string|null;sex:Sex;
    grade_level:number;section_id:string;section_name:string;status:'enrolled'|'withdrawn';action:'promoted'|'conditionally_promoted'|'retained'|'remedial'|null;
    outcome_status:'recommended'|'approved'|'returned'|null;already_enrolled:boolean}[];
  sections:{id:string;grade_level:number;name:string;adviser_name:string|null;male:number;female:number}[];
  runs:unknown[];
};
export type Unplaced='left'|'no_outcome'|'not_approved'|'remedial'|'completer'|'already_enrolled'|'no_section';

/** mulberry32: small, fast and the same in every runtime. */
export function random(seed:number){
  let a=seed>>>0;
  return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
export function shuffle<T>(items:T[],next:()=>number){
  const out=[...items];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[out[i],out[j]]=[out[j]!,out[i]!];}
  return out;
}

const targetGrade=(l:Source['learners'][number])=>l.action==='promoted'||l.action==='conditionally_promoted'?l.grade_level+1:l.grade_level;
const why=(l:Source['learners'][number]):Unplaced|null=>
  l.status!=='enrolled'?'left':!l.action?'no_outcome':l.outcome_status!=='approved'?'not_approved':l.action==='remedial'?'remedial':
  targetGrade(l)>6?'completer':l.already_enrolled?'already_enrolled':null;

export function placeNextYear(source:Source,seed:number,grade:number|null){
  const sections=source.sections.filter(s=>grade===null||s.grade_level===grade);
  const counts=new Map(sections.map(s=>[s.id,{male:s.male,female:s.female,placed_male:0,placed_female:0}]));
  const learner=(l:Source['learners'][number])=>({enrollment_id:l.enrollment_id,learner_id:l.learner_id,first_name:l.first_name,middle_name:l.middle_name,
    last_name:l.last_name,name_extension:l.name_extension,sex:l.sex,from_grade:l.grade_level,from_section:l.section_name,action:l.action,outcome_status:l.outcome_status});
  const placements:(ReturnType<typeof learner>&{to_grade:number;section_id:string})[]=[];
  const unplaced:(ReturnType<typeof learner>&{to_grade:number|null;reason:Unplaced})[]=[];
  const waiting=new Map<number,Source['learners']>();
  for(const l of source.learners){
    const to=targetGrade(l);
    if(grade!==null&&to!==grade)continue;
    const reason=why(l)??(sections.some(s=>s.grade_level===to)?null:'no_section');
    if(reason){unplaced.push({...learner(l),to_grade:reason==='completer'||reason==='left'||reason==='no_outcome'?null:to,reason});continue;}
    waiting.set(to,[...(waiting.get(to)??[]),l]);
  }
  for(const [to,group] of [...waiting].sort((a,b)=>a[0]-b[0])){
    const choices=sections.filter(s=>s.grade_level===to);
    // Sorted first, so the order the database returned rows in cannot change the draw.
    const drawn=shuffle([...group].sort((a,b)=>a.enrollment_id.localeCompare(b.enrollment_id)),random((seed^Math.imul(to+1,0x9E3779B1))>>>0));
    for(const l of drawn){
      // The section with the fewest of this learner's sex, then the fewest in all, then the first by name.
      const size=(id:string)=>{const c=counts.get(id)!;return c.male+c.female+c.placed_male+c.placed_female;};
      const same=(id:string)=>{const c=counts.get(id)!;return l.sex==='male'?c.male+c.placed_male:c.female+c.placed_female;};
      const best=choices.reduce((a,b)=>same(b.id)<same(a.id)||(same(b.id)===same(a.id)&&size(b.id)<size(a.id))?b:a);
      const c=counts.get(best.id)!;
      if(l.sex==='male')c.placed_male+=1;else c.placed_female+=1;
      placements.push({...learner(l),to_grade:to,section_id:best.id});
    }
  }
  const byName=(a:{last_name:string;first_name:string},b:{last_name:string;first_name:string})=>a.last_name.localeCompare(b.last_name)||a.first_name.localeCompare(b.first_name);
  placements.sort(byName);unplaced.sort(byName);
  const review_hash=createHash('sha256').update(JSON.stringify({source:source.source_year.id,target:source.target_year.id,seed,grade,
    placements:placements.map(p=>[p.enrollment_id,p.section_id]).sort((a,b)=>a[0]!.localeCompare(b[0]!))})).digest('hex');
  return {
    source_year:source.source_year,target_year:source.target_year,seed,grade_level:grade,review_hash,
    sections:sections.map(s=>{const c=counts.get(s.id)!;return {id:s.id,grade_level:s.grade_level,name:s.name,adviser_name:s.adviser_name,
      enrolled:{male:s.male,female:s.female},placed:{male:c.placed_male,female:c.placed_female}};}),
    placements,unplaced,runs:source.runs,
  };
}
