"""Reproducible, portrait process ERDs. Requires reportlab, svglib and pymupdf.

Run from the repository root after `npx tsx scripts/export-erd-schema.ts`.
SVG coordinates are points; the figures print at 6.5 inches wide.
"""
from pathlib import Path
from xml.sax.saxutils import escape
import json
import re
import io
import hashlib
import zipfile
import fitz
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/diagrams/paper'
PDF = ROOT / 'output/pdf/edunexus-figures-7-9.pdf'
W, BOX, HEADER, ROW = 480, 140, 30, 14
SCHEMA = json.loads((OUT / 'schema-reference.json').read_text())
COLS = {(c['table_name'], c['column_name']): c for c in SCHEMA['columns']}
FIGURES = []

def node(table, x, y, fields):
    return dict(table=table, x=x, y=y, fields=fields.split(), h=HEADER + ROW * len(fields.split()) + 4)

def edge(parent, child, fk, points, parent_card='1', child_card='0..N'):
    return dict(parent=parent, child=child, fk=fk, points=points, cards=[parent_card, child_card])

FIGURES.append(dict(number=7, slug='class-preparation', title='Class Preparation', height=620,
 nodes=[
  node('academic_years',8,8,'id start_year starts_on ends_on status'),
  node('staff',170,8,'user_id display_name role active'),
  node('reporting_periods',332,8,'id academic_year_id ordinal name starts_on ends_on'),
  node('sections',170,200,'id academic_year_id grade_level name adviser_user_id'),
  node('import_previews',332,200,'id actor_user_id input_hash plan_hash row_count expires_at committed_at'),
  node('learners',8,390,'id lrn first_name last_name birth_date sex merged_into'),
  node('enrollments',170,390,'id learner_id academic_year_id grade_level section_id enrolled_on effective_on status record_state'),
  node('enrollment_events',332,410,'id enrollment_id enrollment_version event_type effective_on section_id reason'),
 ], edges=[
  edge('academic_years','reporting_periods','academic_year_id',[(80,8),(80,0),(402,0),(402,8)]),
  edge('academic_years','sections','academic_year_id',[(80,112),(80,155),(195,155),(195,200)]),
  edge('staff','sections','adviser_user_id',[(265,98),(265,200)],'0..1'),
  edge('staff','import_previews','actor_user_id',[(310,65),(322,65),(322,175),(402,175),(402,200)]),
  edge('academic_years','enrollments','academic_year_id',[(148,80),(157,80),(157,365),(194,365),(194,390)]),
  edge('sections','enrollments','section_id',[(265,304),(265,390)]),
  edge('learners','enrollments','learner_id',[(148,475),(170,475)]),
  edge('enrollments','enrollment_events','enrollment_id',[(310,520),(332,520)]),
  edge('sections','enrollment_events','section_id',[(310,270),(319,270),(319,385),(402,385),(402,410)]),
 ], notes=[
  'One valid enrollment per learner and school year; voided records remain as evidence.',
  'Section placement also checks year and grade. An adviser may be unassigned.',
  'Movement events are original history; correction and identity journals are omitted.',
 ]))

FIGURES.append(dict(number=8, slug='attendance-record', title='Attendance Record', height=730,
 nodes=[
  node('academic_years',8,8,'id start_year status'),
  node('sections',170,8,'id academic_year_id grade_level name adviser_user_id'),
  node('staff',332,8,'user_id display_name role active'),
  node('instructional_calendars',8,185,'id version'),
  node('attendance_days',170,185,'id section_id day_on version'),
  node('enrollments',332,185,'id learner_id section_id status record_state'),
  node('instructional_days',8,365,'id academic_year_id section_id day_on configured am pm'),
  node('attendance_months',170,365,'id section_id academic_year_id month_on status snapshot_id'),
  node('attendance_marks',332,365,'id attendance_day_id enrollment_id day_on am pm'),
  node('attendance_month_snapshots',8,560,'id section_id academic_year_id month_on payload data_hash'),
  node('attendance_followups',332,550,'id enrollment_id section_id assignee_user_id category status opening_evidence'),
 ], edges=[
  edge('academic_years','instructional_calendars','id',[(60,84),(60,185)],child_card='0..1'),
  edge('academic_years','sections','academic_year_id',[(148,55),(170,55)]),
  edge('staff','sections','adviser_user_id',[(332,80),(310,80)],'0..1'),
  edge('instructional_calendars','instructional_days','academic_year_id',[(60,247),(60,365)]),
  edge('sections','instructional_days','section_id',[(170,95),(158,95),(158,339),(112,339),(112,365)],'0..1'),
  edge('sections','attendance_days','section_id',[(265,112),(265,185)]),
  edge('attendance_days','attendance_marks','attendance_day_id',[(240,275),(240,321),(380,321),(380,365)]),
  edge('enrollments','attendance_marks','enrollment_id',[(435,289),(435,365)]),
  edge('sections','attendance_months','section_id',[(195,112),(195,143),(164,143),(164,342),(215,342),(215,365)]),
  edge('attendance_month_snapshots','attendance_months','snapshot_id',[(78,560),(78,517),(240,517),(240,483)],child_card='0..1'),
  edge('enrollments','attendance_followups','enrollment_id',[(472,238),(479,238),(479,615),(472,615)]),
  edge('staff','attendance_followups','assignee_user_id',[(332,42),(321,42),(321,530),(402,530),(402,550)]),
 ], notes=[
  'No configured date means unknown; a null AM/PM mark means not recorded.',
  'A saved month references one snapshot. Before first submission, its draft is virtual.',
  'Follow-ups are manual. Official attendance credits and automatic alerts remain gated.',
 ]))

FIGURES.append(dict(number=9, slug='academic-record', title='Academic Record', height=775,
 nodes=[
  node('academic_years',8,8,'id start_year status'),
  node('assessment_policy_drafts',170,8,'id code components grade_levels status'),
  node('subjects',332,8,'id code name kind grade_levels'),
  node('reporting_periods',8,200,'id academic_year_id ordinal name'),
  node('assessment_policy_adoptions',170,200,'id academic_year_id policy_id policy_version policy_snapshot adopted_on status'),
  node('sections',332,200,'id academic_year_id grade_level name'),
  node('enrollments',8,402,'id learner_id section_id record_state'),
  node('assessment_policy_bindings',170,402,'id offering_id adoption_id status version'),
  node('section_subjects',332,402,'id section_id subject_id subject_snapshot active'),
  node('assessment_scores',8,600,'id task_id enrollment_id raw_score version'),
  node('assessment_tasks',170,565,'id offering_id binding_id reporting_period_id component_code sequence max_score status'),
 ], edges=[
  edge('academic_years','reporting_periods','academic_year_id',[(78,84),(78,200)]),
  edge('academic_years','assessment_policy_adoptions','academic_year_id',[(148,60),(159,60),(159,175),(195,175),(195,200)]),
  edge('assessment_policy_drafts','assessment_policy_adoptions','policy_id',[(270,112),(270,200)]),
  edge('subjects','section_subjects','subject_id',[(472,80),(479,80),(479,445),(472,445)]),
  edge('sections','section_subjects','section_id',[(402,290),(402,402)]),
  edge('assessment_policy_adoptions','assessment_policy_bindings','adoption_id',[(240,332),(240,402)]),
  edge('section_subjects','assessment_policy_bindings','offering_id',[(332,460),(310,460)]),
  edge('assessment_policy_bindings','assessment_tasks','binding_id',[(270,506),(270,565)]),
  edge('section_subjects','assessment_tasks','offering_id',[(402,506),(402,541),(294,541),(294,565)]),
  edge('reporting_periods','assessment_tasks','reporting_period_id',[(148,255),(155,255),(155,543),(195,543),(195,565)]),
  edge('assessment_tasks','assessment_scores','task_id',[(170,650),(148,650)]),
  edge('enrollments','assessment_scores','enrollment_id',[(78,492),(78,600)]),
 ], notes=[
  'An offering may retain many bindings; at most one is currently bound.',
  'Adoption and subject snapshots preserve the selected revisions.',
  'Only raw scores are stored. Null is unrecorded; no grade is computed.',
 ]))

# Tighten the vertical whitespace while retaining the same type size in every figure.
for f in FIGURES:
    if f['number'] == 8:
        shift = lambda y: y - (40 if y >= 500 else 25 if y >= 315 else 20 if y >= 140 else 0)
        f['height'] = 700
    elif f['number'] == 9:
        shift = lambda y: y - (75 if y >= 535 else 67 if y >= 350 else 30 if y >= 170 else 0)
        f['height'] = 700
    else:
        continue
    for n in f['nodes']: n['y'] = shift(n['y'])
    for e in f['edges']: e['points'] = [(x,shift(y)) for x,y in e['points']]

def txt(x,y,value,size=10,bold=False,anchor='start'):
    return f'<text x="{x}" y="{y}" font-family="Helvetica,Arial,sans-serif" font-size="{size}" font-weight="{"bold" if bold else "normal"}" text-anchor="{anchor}" fill="#101010">{escape(value)}</text>'

def key(table,field):
    keys=[]
    for c in SCHEMA['constraints']:
        if c['table_name'] != table: continue
        cols=c['definition'].split('(',1)[1].split(')',1)[0].split(', ')
        if field in cols:
            tag={'p':'PK','f':'FK','u':'UQ'}[c['contype']]
            if tag=='UQ' and len(cols)>1: continue
            if tag not in keys: keys.append(tag)
    return '/'.join(k for k in ['PK','FK','UQ'] if k in keys)

def cardinality(x,y,label):
    width=stringWidth(label,'Helvetica',9)+4
    return f'<rect x="{x-width/2}" y="{y-9}" width="{width}" height="12" fill="white"/>'+txt(x,y,label,9,anchor='middle')

def validate(fig):
    tables={n['table'] for n in fig['nodes']}
    for n in fig['nodes']:
        for f in n['fields']: assert (n['table'],f) in COLS, (n['table'],f)
    for e in fig['edges']:
        assert e['parent'] in tables and e['child'] in tables
        candidates=[c for c in SCHEMA['constraints'] if c['table_name']==e['child'] and c['contype']=='f'
                    and f"REFERENCES edunexus.{e['parent']}(" in c['definition']
                    and e['fk'] in c['definition'].split(')')[0]]
        assert candidates, e
        nullable=COLS[e['child'],e['fk']]['is_nullable']=='YES'
        assert e['cards'][0] == ('0..1' if nullable else '1'), e
    # Relationship routes must not cross an unrelated entity box.
    for e in fig['edges']:
        for (x1,y1),(x2,y2) in zip(e['points'],e['points'][1:]):
            assert x1==x2 or y1==y2
            for n in fig['nodes']:
                if n['table'] in [e['parent'],e['child']]: continue
                if x1==x2:
                    hit=n['x']<x1<n['x']+BOX and max(min(y1,y2),n['y'])<min(max(y1,y2),n['y']+n['h'])
                else:
                    hit=n['y']<y1<n['y']+n['h'] and max(min(x1,x2),n['x'])<min(max(x1,x2),n['x']+BOX)
                assert not hit, (fig['number'],e['parent'],e['child'],'crosses',n['table'])

def svg(fig):
    validate(fig)
    s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="480pt" height="{fig["height"]}pt" viewBox="-8 -12 512 {fig["height"]+12}" role="img">',
       f'<title>Figure {fig["number"]}. Entity-Relationship Diagram for {fig["title"]}</title>',
       '<desc>Selected physical entities and foreign-key relationships, verified against migrations 0001 through 0024. Endpoint numbers specify cardinalities. All attributes shown use exact database names.</desc>',
       '<rect x="-8" y="-12" width="512" height="800" fill="white"/>']
    for e in fig['edges']:
        pts=' '.join(f'{x},{y}' for x,y in e['points'])
        # White casing makes crossings unambiguously disconnected.
        s.append(f'<polyline points="{pts}" fill="none" stroke="white" stroke-width="4"/>')
        s.append(f'<polyline points="{pts}" fill="none" stroke="#222222" stroke-width="0.9"/>')
    for n in fig['nodes']:
        x,y=n['x'],n['y']
        s.extend([f'<rect x="{x}" y="{y}" width="{BOX}" height="{n["h"]}" fill="white" stroke="#111111" stroke-width="0.85"/>',
                  f'<rect x="{x}" y="{y}" width="{BOX}" height="{HEADER}" fill="#e9edf1" stroke="#111111" stroke-width="0.85"/>'])
        words=n['table'].upper().split('_'); lines=['']
        for word in words:
            candidate=(lines[-1]+'_'+word).strip('_')
            if stringWidth(candidate,'Helvetica-Bold',9.6)>BOX-10:
                lines.append(word)
            else: lines[-1]=candidate
        for i,line in enumerate(lines): s.append(txt(x+BOX/2,y+12+(i*11 if len(lines)>1 else 5),line,9.6,True,'middle'))
        for i,f in enumerate(n['fields']):
            base=y+HEADER+12+i*ROW
            label=f+(' ?' if COLS[n['table'],f]['is_nullable']=='YES' else '')
            k=key(n['table'],f)
            assert stringWidth(label,'Helvetica',10)<=BOX-37,(n['table'],label)
            s.append(txt(x+5,base,k,7,True))
            s.append(txt(x+32,base,label))
            if i<len(n['fields'])-1: s.append(f'<path d="M {x} {base+4} H {x+BOX}" stroke="#d0d0d0" stroke-width="0.35"/>')
    for e in fig['edges']:
        pts=e['points']
        for idx,label in [(0,e['cards'][0]),(-1,e['cards'][1])]:
            x,y=pts[idx]; nx,ny=pts[1 if idx==0 else -2]
            if x==nx:
                lx=x+14; ly=y+(15 if ny>y else -7)
            else:
                lx=x+(11 if nx>x else -11); ly=y+(-5 if idx==0 else 13)
            if lx>472: lx=485
            s.append(cardinality(lx,ly,label))
    bottom=max(n['y']+n['h'] for n in fig['nodes'])+31
    for i,line in enumerate([
      'PK primary key   FK foreign key   UQ single-column unique key   ? nullable',
      '1 exactly one   0..1 optional one   0..N zero or many. Crossings do not join.',
      'Selected attributes and relationships; context FKs and journals may be omitted.',
    ]): s.append(txt(8,bottom+i*13,line,8.6))
    s.append('</svg>')
    return '\n'.join(s)

def main():
    OUT.mkdir(parents=True,exist_ok=True); PDF.parent.mkdir(parents=True,exist_ok=True)
    (ROOT/'.local').mkdir(exist_ok=True)
    for m in SCHEMA['migrations']:
        assert hashlib.sha256((ROOT/'database/migrations'/m['file']).read_bytes()).hexdigest()==m['sha256'], 'Schema metadata is stale; export it again.'
    pdf=canvas.Canvas(str(PDF),pagesize=A4,invariant=1)
    pdf.setTitle('EDUNEXUS - Figures 7, 8 and 9'); pdf.setAuthor('EDUNEXUS')
    for f in FIGURES:
        name=f'figure-{f["number"]}-{f["slug"]}'
        data=svg(f); (OUT/f'{name}.svg').write_text(data,encoding='utf-8')
        drawing=svg2rlg(io.BytesIO(data.encode()))
        # Match the manuscript's portrait A4 text area: 85 pt left, 35.4 pt right.
        scale=468/drawing.width; drawing.scale(scale,scale)
        h=drawing.height*scale
        renderPDF.draw(drawing,pdf,85, A4[1]-45-h)
        y=A4[1]-45-h-19
        pdf.setFont('Times-Bold',11)
        pdf.drawString(85,y,f'Figure {f["number"]}. Entity-Relationship Diagram for {f["title"]}')
        pdf.setFont('Times-Roman',9)
        for line in f['notes']:
            y-=12; pdf.drawString(85,y,line)
        assert y>20,(f['number'],y)
        pdf.showPage()
        # Rasterize the vector figure, not a screenshot of a scaled browser preview.
        doc=fitz.open(stream=data.encode(),filetype='svg')
        p=fitz.open('pdf',doc.convert_to_pdf()); pix=p[0].get_pixmap(dpi=600,alpha=False)
        pix.save(OUT/f'{name}.png')
    pdf.save()
    doc=fitz.open(PDF)
    for i,page in enumerate(doc):
        page.get_pixmap(dpi=110,alpha=False).save(ROOT/f'.local/erd-paper-page-{i+1}.png')
    with zipfile.ZipFile(ROOT/'output/edunexus-capstone-figures-7-9.zip','w',zipfile.ZIP_DEFLATED) as package:
        package.writestr('START-HERE.txt', 'EDUNEXUS capstone figures 7-9\n\nOpen output/pdf/edunexus-figures-7-9.pdf to review all three figures.\nInsert the individual SVG or PNG files from docs/diagrams/paper into Word at 6.5 inches wide, preserving aspect ratio. Add the matching caption below each.\nRead docs/diagrams/paper/README.md for notation and scope, and docs/system-and-erd-review-2026-09-28.md for the system review.\nThe included generators run from a full EDUNEXUS checkout; the ZIP is a delivery bundle, not a standalone application.\n')
        files=[*OUT.glob('*'),PDF,ROOT/'docs/system-and-erd-review-2026-09-28.md',ROOT/'scripts/render-paper-erds.py',ROOT/'scripts/export-erd-schema.ts']
        for p in sorted(files):
            if p.is_file(): package.write(p,p.relative_to(ROOT).as_posix())
    print(f'Created {len(FIGURES)} verified SVG/600-dpi PNG figures and {PDF}')

if __name__=='__main__': main()
