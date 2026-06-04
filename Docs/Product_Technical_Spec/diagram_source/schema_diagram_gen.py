#!/usr/bin/env python3
"""Generates the Digital Fees Register §3.1 schema diagram (SVG + PNG).
Editable source: change the *_ELEMENTS lists below and re-run.
v1 corrections: dob / date_of_admission / aadhaar_no = nullable;
families at-least-one-parent CHECK marked deferred."""
import cairosvg

W, H = 1920, 1320
SANS = "DejaVu Sans"
MONO = "DejaVu Sans Mono"

# palette
C_FAM, C_STU, C_PAY, C_FEE = "#08A0E8", "#10B880", "#F09808", "#8858F0"
NAME, TYPE, SUB, NOTE, DIV = "#0F172A", "#64748B", "#94A3B8", "#475569", "#E2E8F0"
BORDER, PKDOT, FKDOT = "#CBD5E1", "#EF4444", "#2563EB"

def esc(s): return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def txt(x,y,s,size,fill,font=SANS,w="normal",anchor="start",italic=False,ls=None):
    extra = f' font-style="italic"' if italic else ""
    extra += f' letter-spacing="{ls}"' if ls else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{font}" font-size="{size}" '
            f'fill="{fill}" font-weight="{w}" text-anchor="{anchor}"{extra}>{esc(s)}</text>')

HDR=46
def el_h(e):
    return {"field":25,"subhead":30,"note":18,"divider":13}[e[0]]

def card(x,y,w,color,title,subtitle,elements,header_note=None):
    body_top = HDR + 44
    total = body_top + sum(el_h(e) for e in elements) + 12
    p=[]
    # background
    p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{total}" rx="14" '
             f'fill="#FFFFFF" stroke="{BORDER}" stroke-width="1.5"/>')
    # header (top corners rounded)
    p.append(f'<path d="M{x},{y+HDR} L{x},{y+14} Q{x},{y} {x+14},{y} '
             f'L{x+w-14},{y} Q{x+w},{y} {x+w},{y+14} L{x+w},{y+HDR} Z" fill="{color}"/>')
    p.append(txt(x+18, y+30, title, 22, "#FFFFFF", w="bold"))
    if header_note:
        p.append(txt(x+w-16, y+29, header_note, 13, "#EAF7FF", italic=True, anchor="end"))
    p.append(txt(x+18, y+HDR+20, subtitle, 12.5, SUB))
    cy = y + body_top
    for e in elements:
        t=e[0]
        if t=="field":
            _,dot,name,typ=e
            if dot:
                p.append(f'<circle cx="{x+20}" cy="{cy-5}" r="5" '
                         f'fill="{PKDOT if dot=="PK" else FKDOT}"/>')
                nx=x+34
            else:
                nx=x+20
            p.append(txt(nx, cy, name, 15.5, NAME, font=MONO))
            p.append(txt(x+w-18, cy, typ, 13.5, TYPE, anchor="end"))
        elif t=="subhead":
            p.append(f'<line x1="{x+16}" y1="{cy-12}" x2="{x+w-16}" y2="{cy-12}" '
                     f'stroke="{DIV}" stroke-width="1"/>')
            if e[1]:
                p.append(txt(x+18, cy+4, e[1], 11, SUB, w="bold", ls="0.6"))
        elif t=="divider":
            p.append(f'<line x1="{x+16}" y1="{cy-4}" x2="{x+w-16}" y2="{cy-4}" '
                     f'stroke="{DIV}" stroke-width="1"/>')
        elif t=="note":
            p.append(txt(x+18, cy, e[1], 12.5, NOTE, font=MONO))
        cy += el_h(e)
    return "".join(p), total

FAM=[("field","PK","id","UUID  ·  PK"),
     ("field",None,"father_name","VARCHAR(80) ◇"),
     ("field",None,"mother_name","VARCHAR(80) ◇"),
     ("field",None,"phone","CHAR(10) nullable"),
     ("field",None,"address","TEXT nullable"),
     ("field",None,"p_dues","INT  default 0"),
     ("field",None,"status","active / withdrawn"),
     ("field",None,"created_at","TIMESTAMPTZ"),
     ("field",None,"updated_at","TIMESTAMPTZ"),
     ("subhead","CONSTRAINTS"),
     ("note","◇ CHECK (father_name IS NOT NULL"),
     ("note","        OR mother_name IS NOT NULL)"),
     ("note","   — DEFERRED in v1 (both nullable)"),
     ("note","phone ~ '^[0-9]{10}$'  (if not NULL)")]

STU=[("field","PK","id","UUID  ·  PK"),
     ("field","FK","family_id","UUID  ·  FK → families.id"),
     ("field",None,"name","VARCHAR(80) UPPERCASE"),
     ("field",None,"class","VARCHAR(8)"),
     ("field",None,"roll_no","INT · UNIQUE(class, roll_no)"),
     ("field",None,"dob","DATE · nullable ★"),
     ("field",None,"date_of_admission","DATE · nullable ★"),
     ("field",None,"aadhaar_no","CHAR(12) nullable ★"),
     ("field",None,"pen","VARCHAR(32) nullable ★"),
     ("subhead","PER-STUDENT CONCESSION (FB#7)"),
     ("field",None,"monthly_fee_override","INT nullable ★"),
     ("field",None,"term_fees_override","INT nullable ★"),
     ("field",None,"exam_fees_override","INT nullable ★"),
     ("field",None,"concession_reason","VARCHAR(64) nullable ★"),
     ("divider",),
     ("field",None,"status","active / graduated / withdrawn"),
     ("field",None,"created_at","TIMESTAMPTZ"),
     ("field",None,"updated_at","TIMESTAMPTZ"),
     ("subhead","CONSTRAINTS"),
     ("note","aadhaar_no IS NULL OR ~ '^[0-9]{12}$'"),
     ("note","name = UPPER(name)"),
     ("note","UNIQUE(class, roll_no)"),
     ("note","ON DELETE family → CASCADE"),
     ("note","★ override: NULL=class default · 0=waived"),
     ("note","            · >0 = exact override amount")]

PAY=[("field","PK","id","UUID  ·  PK"),
     ("field","FK","family_id","UUID  ·  FK → families.id"),
     ("field","FK","student_id","UUID  ·  FK · nullable"),
     ("field",None,"fee_head","enum (see below)"),
     ("field",None,"period","VARCHAR(10) · e.g. 2026-04"),
     ("field",None,"amount","INT > 0"),
     ("field",None,"paid_on","DATE"),
     ("field",None,"payment_mode","Cash / Cheque / UPI / Bank"),
     ("field",None,"reference_no","VARCHAR(64) nullable"),
     ("field",None,"notes","TEXT nullable"),
     ("field",None,"status","active / void"),
     ("field",None,"created_at","TIMESTAMPTZ"),
     ("field",None,"updated_at","TIMESTAMPTZ"),
     ("subhead","FEE_HEAD ENUM"),
     ("note","'Monthly' · period = 'YYYY-MM'"),
     ("note","'Annual' (T.Fees) · period = session"),
     ("note","'Sep Exam' / 'Feb Exam'"),
     ("note","'P.Dues' · carry-forward  ·  'Misc'"),
     ("subhead","RULES"),
     ("note","amount > 0  (waivers = override 0,"),
     ("note","        not a zero-amount row)"),
     ("note","immutable — void + re-enter, never edit"),
     ("note","student_id NULL = whole family ·"),
     ("note","            set = single child")]

FEE=[("field","PK","id","UUID  ·  PK"),
     ("field",None,"class","VARCHAR(8) UNIQUE"),
     ("field",None,"monthly_fee","INT"),
     ("field",None,"annual_fee","INT  (T.Fees)"),
     ("field",None,"sep_exam_fee","INT"),
     ("field",None,"feb_exam_fee","INT"),
     ("field",None,"misc_fee","INT  default 0"),
     ("field",None,"effective_from","DATE"),
     ("divider",),
     ("note","Class 10:  1500 / 1500 / 400 / 400")]

s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
s.append(f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>')
# title
s.append(txt(W/2, 52, "Digital Fees Register — Schema (v1)", 32, "#0F172A", w="bold", anchor="middle"))
s.append(txt(W/2, 82, "Four tables · primary keys · foreign keys · cardinality", 16, SUB, anchor="middle"))
# legend
lx,ly,lw,lh=70,140,330,118
s.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="10" fill="#F8FAFC" stroke="{BORDER}" stroke-width="1.2"/>')
s.append(txt(lx+16, ly+24, "LEGEND", 12, SUB, w="bold", ls="0.8"))
s.append(f'<circle cx="{lx+22}" cy="{ly+46}" r="5" fill="{PKDOT}"/>')
s.append(txt(lx+38, ly+50, "PK — Primary key (UUID)", 13, NOTE))
s.append(f'<circle cx="{lx+22}" cy="{ly+70}" r="5" fill="{FKDOT}"/>')
s.append(txt(lx+38, ly+74, "FK — Foreign key", 13, NOTE))
s.append(txt(lx+16, ly+98, "→ relationship   ·   N = many   ·   1 = one", 13, NOTE))

# cards
fx,fy,fw=70,300,380
fsx,fsy,fsw=70,760,380
sx,sy,sw=620,250,520
px,py,pw=1280,250,580
fam_svg,hf=card(fx,fy,fw,C_FAM,"families","THE BILLING UNIT · one row per real-world family",FAM)
fee_svg,hfe=card(fsx,fsy,fsw,C_FEE,"fee_structures","PER-CLASS DEFAULTS · catalogue",FEE)
stu_svg,hs=card(sx,sy,sw,C_STU,"students","PER-STUDENT · siblings share family_id",STU,header_note="family ledger")
pay_svg,hp=card(px,py,pw,C_PAY,"payments","ONE ROW PER MONEY EVENT · immutable",PAY)

# arrows (drawn under cards so they tuck behind edges)
s.append('<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="3" '
         'orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#475569"/></marker>'
         '<marker id="ahp" markerWidth="10" markerHeight="10" refX="8" refY="3" '
         'orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#8858F0"/></marker></defs>')
# families -> students (solid)
y1=fy+hf*0.42; y2=sy+hs*0.42
s.append(f'<path d="M{fx+fw},{y1:.0f} L{sx},{y2:.0f}" stroke="#475569" stroke-width="2" fill="none" marker-end="url(#ah)"/>')
s.append(txt((fx+fw+sx)/2, (y1+y2)/2-8, "has many", 12.5, NOTE, anchor="middle"))
s.append(txt((fx+fw+sx)/2, (y1+y2)/2+10, "1 — N", 12, SUB, anchor="middle"))
# families -> payments (solid, curves above students)
s.append(f'<path d="M{fx+fw},{fy+22} C540,185 900,185 {px},{py+52}" stroke="#475569" stroke-width="2" fill="none" marker-end="url(#ah)"/>')
s.append(txt(965, 178, "1 — N", 12, SUB, anchor="middle"))
# students -> payments (dashed)
ys=sy+hs*0.4
s.append(f'<path d="M{sx+sw},{ys:.0f} L{px},{ys:.0f}" stroke="#64748B" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ah)"/>')
s.append(txt((sx+sw+px)/2, ys-8, "child-specific", 12, SUB, anchor="middle"))
s.append(txt((sx+sw+px)/2, ys+10, "(rare) · 1 — 0..N", 11.5, SUB, anchor="middle"))
# fee_structures -> students (dashed purple)
s.append(f'<path d="M{fsx+fsw},{fsy+34} C540,{fsy} {sx-40},{sy+hs-40} {sx},{sy+hs-70:.0f}" stroke="#8858F0" stroke-width="2" stroke-dasharray="6 4" fill="none" marker-end="url(#ahp)"/>')
s.append(txt(545, fsy+8, "keyed by class", 12, C_FEE))

s.append(fam_svg); s.append(fee_svg); s.append(stu_svg); s.append(pay_svg)

# footer: FIELD OWNERSHIP
fox,foy,fow,foh=70,1140,1790,150
s.append(f'<rect x="{fox}" y="{foy}" width="{fow}" height="{foh}" rx="12" fill="#D0E8F8" stroke="#7CC0EE" stroke-width="1.2"/>')
s.append(txt(fox+20, foy+30, "FIELD OWNERSHIP — read this when wiring forms", 15, "#084868", w="bold"))
s.append(txt(fox+20, foy+62, "families ↔  father_name · mother_name · phone · address · p_dues   (editing on any sibling propagates to all siblings)", 13.5, "#0F3A52"))
s.append(txt(fox+20, foy+90, "students ↔  name · class · roll_no · dob · date_of_admission · aadhaar_no · pen · *_override · concession_reason · status   (per-student, never shared)", 13.5, "#0F3A52"))
s.append(txt(fox+20, foy+118, "payments ↔  fee_head · period · amount · paid_on · payment_mode · reference_no · notes · status   (one immutable row per money event)", 13.5, "#0F3A52"))

s.append("</svg>")
svg="".join(s)
open("schema_diagram.svg","w").write(svg)
cairosvg.svg2png(bytestring=svg.encode(), write_to="schema_diagram.png",
                 output_width=W, output_height=H, background_color="white")
print("wrote schema_diagram.svg + schema_diagram.png  heights:",
      "fam",round(hf),"fee",round(hfe),"stu",round(hs),"pay",round(hp))
