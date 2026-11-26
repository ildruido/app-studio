import json,os,subprocess,sys,shutil,tempfile,re,time
from concurrent.futures import ThreadPoolExecutor
# Routing test: does an unprimed request start the right skill when all skills are loaded together?
# usage: run.py <runs> <out.json> [descriptions.json]
# Builds the fixture app from THIS repo (current core and module skills + app template), so it never goes stale.
# descriptions.json (optional): {skill: description} to try wording changes without editing the skills.
# Costs real usage (one short claude call per query per run): run it only when Ale approves.
runs=int(sys.argv[1]); out=sys.argv[2]
desc=json.load(open(sys.argv[3])) if len(sys.argv)>3 else {}
here=os.path.dirname(os.path.abspath(__file__))
repo=os.path.abspath(os.path.join(here,"..",".."))
work=tempfile.mkdtemp(prefix="fx-")
shutil.copytree(os.path.join(repo,"plugins/studio/skills"),os.path.join(work,".claude/skills"))
# Module skills (packs/<name>/skills/<skill>/) are loaded too, as in an app that added every module.
for pk in sorted(os.listdir(os.path.join(repo,"packs"))):
    sd=os.path.join(repo,"packs",pk,"skills")
    for n in (sorted(os.listdir(sd)) if os.path.isdir(sd) else []): shutil.copytree(os.path.join(sd,n),os.path.join(work,".claude/skills",n))
tpl=os.path.join(repo,"plugins/studio/templates")
shutil.copy(os.path.join(tpl,"CLAUDE.md"),os.path.join(work,"CLAUDE.md"))
with open(os.path.join(work,"CLAUDE.md"),"a") as f:
    f.write("\n\n## Fixture App profile\nApp: chess clock demo. Phase: build.\n\n")
    f.write(open(os.path.join(tpl,"project-instructions.md")).read())
os.makedirs(os.path.join(work,"docs"),exist_ok=True)
open(os.path.join(work,"docs/BACKLOG.md"),"w").write("# Backlog\n\n### CC-014 Export a game as PGN\n- Status: Ready\n\n### CC-015 Clock keeps running after checkmate\n- Status: Ready\n")
subprocess.run(["git","init","-q"],cwd=work)
names=sorted(os.listdir(os.path.join(work,".claude/skills")))
for n,d in desc.items():
    p=os.path.join(work,".claude/skills",n,"SKILL.md"); t=open(p).read()
    t=re.sub(r"^description:.*$","description: "+json.dumps(d),t,count=1,flags=re.M); open(p,"w").write(t)
def one(a):
    for att in range(3):
        r=one1(a)
        if r[4]!='ERR': return r
        time.sleep(20)
    return r
def one1(a):
    exp,kind,q,i=a
    seen=False
    env={k:v for k,v in os.environ.items() if k!="CLAUDECODE"}
    pr=subprocess.Popen(["claude","-p",q,"--output-format","stream-json","--verbose","--model","claude-sonnet-5-5","--max-turns",os.environ.get("MT","1")],cwd=work,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env)
    got="none";cost=0
    try:
        t0=time.time()
        for l in pr.stdout:
            try:e=json.loads(l)
            except:continue
            if e.get("type")=="assistant":
                seen=True
                for c in e["message"].get("content",[]):
                    if c.get("type")=="tool_use":
                        s=json.dumps(c.get("input",{}))
                        hit=[n for n in names if n in s]
                        if c["name"]=="Skill" and hit: got=hit[0]
                        elif c["name"]=="Read" and hit: got=hit[0]
                        elif got=="none": got="other:"+c["name"]
                if got!="none" and (got in names or os.environ.get('MT','1')=='1'): pr.kill();break
            if e.get("type")=="result": cost=e.get("total_cost_usd",0)
            if time.time()-t0>200: pr.kill();break
    finally:
        try:pr.kill()
        except:pass
    if not seen and got=='none': got='ERR'
    return exp,kind,q,i,got,cost
Q=json.load(open(os.path.join(here,"queries.json")))
if os.environ.get("ONLY"): Q=[x for x in Q if any(k in x[2] for k in os.environ["ONLY"].split("|"))]
jobs=[(e,k,q,i) for e,k,q in Q for i in range(runs)]
with ThreadPoolExecutor(3) as ex: R=list(ex.map(one,jobs))
json.dump(R,open(out,"w"),indent=1)
def ok(e,g):
    g='none' if g.startswith('other:') else g
    return g in (e if isinstance(e,list) else [e])
tot=len(R);good=sum(ok(e,g) for e,k,q,i,g,c in R)
print("accuracy",good,"/",tot)
for kind in "ub": 
    r=[x for x in R if x[1]==kind];print(kind,sum(ok(x[0],x[4]) for x in r),"/",len(r))
from collections import Counter
for e,k,q,i,g,c in R:
    if not ok(e,g): print("MISS",e,"->",g,"|",k,q[:70])
shutil.rmtree(work)
print("Review misses by hand: a label can be wrong (2 of 35 were in the first round).")
