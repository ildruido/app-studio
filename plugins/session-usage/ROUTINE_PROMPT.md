Daily usage snapshot for the project. Mechanical and cheap: do not reply unless something fails, then end the turn silently (no_reply_needed).

State lives only in <SHARED>/usage/snapshots.csv. Header:
taken_at,session_id,kind,title,parent_session_id,model,status,input,output,cache_read,cache_write,cost_usd

Session ids come as cse_X or session_X for the same session: always compare and store them WITHOUT the cse_/session_ prefix (store the bare id, e.g. 01KYdUdkRFPSJrq5KvD17evJ).
1. Read snapshots.csv. For each session_id, note the newest taken_at ("last_read"). Read only the last 400 lines if the file is large.
2. List sessions: list_thread_sessions (gives last_activity_at for every thread). Coordinators: list_sessions cannot filter by tag, so take the distinct parent_session_id values of the thread sessions (from their earlier rows, column parent_session_id) plus any session from list_sessions (limit 100, include archived) whose title starts with "Project coordinator". Their updated_at is the activity time. Do not call get_session yet.
3. A session needs reading if it is not in the file, or its last activity/updated time is later than its last_read. Skip all others.
4. Read all sessions that need reading in ONE parallel batch of get_session calls. Take external_metadata.usage (input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd), title, parent_session_id, external_metadata.last_served_model, status. Missing usage means zeros.
5. If nothing needs reading, stop. Otherwise append one row per read session (kind = thread or coordinator, taken_at = now UTC), re-reading the file just before appending and never overwriting rows. Check the rows are present about ten seconds later.
6. If any read or the write failed, reply with one short line naming it.
5b. For every session you appended that has no line in <SHARED>/usage/sessions.csv (columns session_id,created_at,desc), append one: bare id, created_at date (YYYY-MM-DD from get_session), desc = the title.
7. Refresh the dashboard ONLY if step 5 appended rows. Use a scratch folder (your scratchpad directory) as <OUT>:
   python3 -I <SHARED>/plugins/session-usage/scripts/build_dashboard.py <SHARED>/usage/snapshots.csv <OUT> --annotations <SHARED>/usage/annotations.csv --sessions <SHARED>/usage/sessions.csv --project "<project name>"
   Then publish in this order (the first publish of a session is always refused unless the live version was read first):
   a. MANDATORY, do this first and right before (b), after the build finishes: call Artifact action=read on <DASHBOARD_URL> (no path). This marks the live version as seen. Never call the publish in (b) before this read has returned in this run; if you are about to publish and have not read yet, stop and read.
   b. Call Artifact: file_path=<OUT>/index.html, url=<DASHBOARD_URL>, files={"data.json": "<OUT>/data.json"}. Do not pass an icon.
   c. If it is refused with "identical content already refused ... resent unchanged", or because the read in (a) came back with a newer version, the refusal has just marked that version as seen: call the same publish (b) again unchanged. A refusal even though you read first means someone published in between: repeat (a) then (b) again, up to 3 tries in total. If it asks for overwrite_unread, pass ["data.json"]. Never leave a refused publish as the final outcome without trying (a)-(c) twice; if still refused, report one line.
   A refused publish is NOT harmless: the page stays stale. On a quiet day (no new rows) do nothing.
   Fill in per project: <project name> and <DASHBOARD_URL> (the dashboard artifact; keep it in the project's memory).
