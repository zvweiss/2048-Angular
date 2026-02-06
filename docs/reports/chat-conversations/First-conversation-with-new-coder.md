Fix game service undo typing errors


Fixed the syntax break: the class was accidentally closed at game.service.ts (line 279), and the SavedSpawn/SavedSpawnMeta type aliases were in the middle of the class, which caused all later methods to be parsed outside the class.

I moved the type aliases to the bottom of the file (after the class) and removed the stray } so the class now closes only at the end of the file.

If you want, I can re-run the build or ng serve to confirm the errors are gone.

If you want, I can re-run the build or ng serve to confirm the errors are gone.

Next steps

I can run the TypeScript build or ng serve to verify.

Sounds good. Let me know what errors (if any) show up after the restart.


User attachment
The Record run is missing, see attached

Explored 2 files, 1 search
Edited file
run-history.component.ts
+1
-1

  private filterRunsWithTopTiles(runs: RunSummary[]): RunSummary[] {
    return runs.filter((run) => (run.topTiles ?? []).length > 0);
    return runs;
  }
The Record run was being filtered out. The run history view only kept runs where topTiles length > 0, so any run that never hit 512+ tiles vanished.

I removed that filter so all runs show.

Change:

run-history.component.ts
If you refresh the Runs page, the Record run should appear. If you still don’t see it, tell me the date/time and engine and I’ll trace it from storage.
1 file changed
Undo

Review
src/app/pages/run-history/run-history.component.ts
what do you mean by Refresh the Runs page. At this point I do not see the Record run, just like before

By “refresh,” I mean reload the browser tab that shows /runs so the updated code loads (or navigate away and back to Runs). If the dev server is still running, a normal reload should pick up the change; a hard reload is even safer.

Try this:

In the Runs tab



If you refresh the Runs page, the Record run should appear. If you still don’t see it, tell me the date/time and engine and I’ll trace it from storage.

what do you mean by Refresh the Runs page. At this point I do not see the Record run, just like before

Next: please run a short Record session and stop it, then check Runs. It should appear with Game Mode = record and Reason = stop.

If you want, I can also add a small “Run History Debug” panel to show raw count and last entries to make this sort of thing easier to verify.

The Record run is now in the report but it does not have a label. The label provided when Saved shoud be added to the Runs table

Got it. The label wasn’t being attached to runs because we only set replayLabel for replay mode, and record labels are set after saving.

I fixed both parts:

When we log a run, we now include the label for record mode too (if present).
When you save a recording and enter a label, we update the latest record run in history to add that label.

Please save a recording with a label and check Runs. It should show under the “Replay Label” column. If not, tell me the exact label and time you saved; I’ll trace it from storage.

good, Now we need to remove all Replay runs without Labels

Done. I added a prune step that removes any run where gameMode === 'replay' and replayLabel is empty.

Reload /runs once; those unlabeled replay runs will be removed from storage and the table. If you want this exposed as a manual button instead of auto-prune, say the word and I’ll switch it.

I think we should excelude Record line from Clean history, we should always have them available for future Replay runs, it may take a very long run to creat a Saved Spawns record. 

Done. “Clear History” now preserves all record runs so you don’t lose long recordings.

Reload /runs and hit “Clear History” to confirm it leaves record entries intact. If you want a separate “Clear Non‑Record” button (and keep Clear History as a full wipe), say the word.

i'm not inclined to have the button I rather have our app take care of leaving rhe Record lines. We need to do a little cleanup, look at the attached image.  There are two replay lines for which there is no corresponding Record, and there is none record line without a Rpaly label. These line should be removed from the table and our list of runs alltogether

Remove any record run that has no label.
Remove any replay run whose label doesn’t match an existing record label.
This cleans both of the problems you described.

Reload /runs once; the orphan replays and unlabeled records will be removed from storage and the table.

If you want a stricter match (e.g., also require same engine or date range), say the word.

That record row without a label is still hanging around because the cleanup only ran on page init. I moved the cleanup into refreshRuns() so it always prunes before the table reads from storage.

Reload /runs once. That unlabeled record row should disappear along with any replay rows whose label d

We removed the the Saved runs "Short testing..."  and "Partial run". They should not br included in thr Replay Recoring drop down. see attached 

Got it. I filtered the Replay Recording dropdown to only show saved spawns that have a matching record run label in run history. That removes “short testing…” and “Partial run” from the dropdown since their record runs were pruned.

Reload the game page and open the Replay Recording dropdown — those entries should be gone.

If you want me to actually delete those saved spawns from storage (not just hide), say the word and I’ll add a prune step.

