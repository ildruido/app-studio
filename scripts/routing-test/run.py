import json,os,subprocess,sys,shutil,tempfile,re,time
from concurrent.futures import ThreadPoolExecutor
# Routing test: does an unprimed request start the right skill when all skills are loaded together?
# usage: run.py <runs> <out.json> [descriptions.json]
# Builds the fixture app from THIS repo (current core and module skills + app template), so it never goes stale.
# descriptions.json (optional): {skill: description} to try wording changes without editing the skills.
# Requests for a discovery-module skill run in a second fixture: Phase discovery, the module's starter documents, no backlog
# (a discovery question asked of an app that is already building sent the model to inspect the repo instead, #405).
# Each run also leaves a small summary (score, misses, cost) in results/<date>.json: commit it with the PR, so a later
# review can see where the misses went.
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
# The discovery fixture: the same skills, an app still in discovery.
workd=tempfile.mkdtemp(prefix="fxd-")
shutil.copytree(os.path.join(work,".claude"),os.path.join(workd,".claude"))
dstart=os.path.join(repo,"packs/discovery/starter")
if os.path.isdir(dstart): shutil.copytree(dstart,workd,dirs_exist_ok=True)
with open(os.path.join(workd,"CLAUDE.md"),"w") as f:
    f.write(open(os.path.join(tpl,"CLAUDE.md")).read())
    f.write("\n\n## Fixture App profile\nApp: lesson booking demo. Phase: discovery (no stack yet, no backlog).\n\n## Discovery profile\nProduct: bookings for independent music teachers. Target users: music teachers with 10 to 40 pupils. Docs folder: docs/discovery/. Sign-off mode: per artifact.\n\n")
    f.write(open(os.path.join(tpl,"project-instructions.md")).read())
subprocess.run(["git","init","-q"],cwd=workd)
dsk=os.path.join(repo,"packs/discovery/skills")
DISCOVERY=set(os.listdir(dsk)) if os.path.isdir(dsk) else set()
fixture=lambda exp: workd if DISCOVERY & set(exp if isinstance(exp,list) else [exp]) else work
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
    fx=fixture(exp)
    # A cloud container starts headless runs without the folder's CLAUDE.md (CLAUDE_CODE_IGNORE_PERSISTED_TRUST): hand it over
    # as system prompt text, or the test measures the skill descriptions alone and not the template's routing lines.
    extra=["--append-system-prompt-file",os.path.join(fx,"CLAUDE.md")] if os.environ.get("CLAUDE_CODE_IGNORE_PERSISTED_TRUST") else []
    pr=subprocess.Popen(["claude","-p",q,"--output-format","stream-json","--verbose","--model","claude-sonnet-5-5","--max-turns",os.environ.get("MT","1")]+extra,cwd=fx,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env)
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
                        elif c["name"]=="Bash" and [n for n in names if "skills/"+n+"/" in s]: got=[n for n in names if "skills/"+n+"/" in s][0]  # `cat .claude/skills/<name>/SKILL.md` is reading the skill too
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
shutil.rmtree(work);shutil.rmtree(workd)
head=subprocess.run(["git","rev-parse","--short","HEAD"],cwd=repo,capture_output=True,text=True).stdout.strip()
res=os.path.join(here,"results");os.makedirs(res,exist_ok=True)
json.dump({"date":time.strftime("%Y-%m-%d"),"commit":head,"model":"claude-sonnet-5-5","max_turns":os.environ.get("MT","1"),"only":os.environ.get("ONLY",""),"runs":runs,"right":good,"total":tot,
  "misses":[{"expected":e,"got":g,"kind":k,"query":q} for e,k,q,i,g,c in R if not ok(e,g)]},open(os.path.join(res,time.strftime("%Y-%m-%d")+("-only" if os.environ.get("ONLY") else "")+".json"),"w"),indent=1)
print("Review misses by hand: a label can be wrong (2 of 35 were in the first round). A miss marked other:Bash means the model looked at the repo first: run it again with MT=4 ONLY=\"<part of the request>\" before changing a description.")
