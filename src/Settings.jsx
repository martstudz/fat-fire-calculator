import React from "react";

export default function Settings({
  user,
  authLoading,
  household,
  householdMembers,
  householdPanelRef,
  activePlan,
  personalPlanId,
  copied,
  joinInput,
  setJoinInput,
  joinError,
  signInWithGoogle,
  signOut,
  switchPlan,
  createHousehold,
  removeMember,
  copyShareUrl,
  handleJoinSubmit,
  resetToDefaults,
  s,
  saveStatus,
}) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>

      {/* ── Account ── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>Account</div>
        {authLoading ? (
          <div style={{ color: "var(--ink-3)", fontSize: "var(--step--1)" }}>Loading…</div>
        ) : user ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              {user.user_metadata?.avatar_url && (
                <img src={user.user_metadata.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              )}
              <div>
                <div style={{ fontSize: "var(--step-0)", fontWeight: 500, color: "var(--ink)" }}>
                  {user.user_metadata?.full_name || user.user_metadata?.name || "User"}
                </div>
                <div style={{ fontSize: "var(--step--1)", color: "var(--ink-3)" }}>{user.email}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={signOut} className="btn btn--outline btn--sm">Sign out</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "var(--step--1)", color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Sign in to sync your plan across devices and share with a partner.
            </p>
            <button onClick={signInWithGoogle} className="btn btn--primary btn--sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </button>
          </div>
        )}
      </section>

      {/* ── Plan ── */}
      {user && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>Active plan</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}>
                {activePlan === "household" ? "🏠 Household plan (shared)" : "👤 My personal plan"}
              </div>
              <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 2 }}>
                {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save error" : "Changes auto-saved"}
              </div>
            </div>
            {user && household && personalPlanId && activePlan && (
              <div className="seg">
                <button onClick={() => switchPlan("personal")} className={activePlan === "personal" ? "is-active" : ""}>My Plan</button>
                <button onClick={() => switchPlan("household")} className={activePlan === "household" ? "is-active" : ""}>Household</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Household ── */}
      {user && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>Household</div>

          {!household ? (
            <div>
              <p style={{ fontSize: "var(--step--1)", color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.6 }}>
                Create a shared household plan to collaborate with your partner. You'll each be able to see and edit the same plan.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => createHousehold(user.id, s)} className="btn btn--primary btn--sm">
                  {copied ? "✓ Invite link copied!" : "＋ Create household"}
                </button>
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: "var(--step--1)", fontWeight: 500, color: "var(--ink-2)", marginBottom: 8 }}>Join an existing household</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Enter join code"
                    value={joinInput}
                    onChange={e => setJoinInput(e.target.value.toUpperCase())}
                    className="input mono"
                    style={{ width: 140, padding: "6px 10px", letterSpacing: "0.1em" }}
                  />
                  <button onClick={handleJoinSubmit} className="btn btn--outline btn--sm">Join</button>
                  {joinError && <span style={{ fontSize: "var(--step--2)", color: "oklch(42% 0.12 25)" }}>{joinError}</span>}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Members list */}
              <div style={{ marginBottom: 16 }}>
                <div className="label-xs" style={{ marginBottom: 10 }}>Members</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {householdMembers.map(m => {
                    const isOwner = m.user_id === household.created_by;
                    const canRemove = !isOwner && (user?.id === household.created_by || m.user_id === user?.id);
                    return (
                      <div key={m.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--paper-2)", borderRadius: "var(--r-3)", border: "1px solid var(--line)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          {m.avatar_url
                            ? <img src={m.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                            : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--paper-3)", display: "grid", placeItems: "center", fontSize: 13, color: "var(--ink-3)", flexShrink: 0, fontWeight: 500 }}>
                                {(m.name || m.email || "?")[0].toUpperCase()}
                              </div>
                          }
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "var(--step--1)", fontWeight: 500, color: "var(--ink)" }}>
                              {m.name || m.email}
                              {isOwner && <span style={{ color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }}>(owner)</span>}
                              {m.user_id === user?.id && <span style={{ color: "var(--accent)", fontWeight: 400, marginLeft: 4 }}>(you)</span>}
                            </div>
                            {m.name && <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>{m.email}</div>}
                          </div>
                        </div>
                        {canRemove && (
                          <button
                            onClick={() => removeMember(m.user_id)}
                            className="btn btn--ghost btn--sm"
                            style={{ fontSize: 13, color: "var(--ink-3)" }}
                            title={m.user_id === user?.id ? "Leave household" : "Remove member"}
                          >
                            {m.user_id === user?.id ? "Leave" : "Remove"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Share link */}
              <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: "var(--r-3)", border: "1px solid var(--line)" }}>
                <div className="label-xs" style={{ marginBottom: 8 }}>Invite link</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: "var(--step--2)", color: "var(--ink-2)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {`?join=${household.join_code}`}
                  </div>
                  <button onClick={copyShareUrl} className="btn btn--primary btn--sm">
                    {copied ? "✓ Copied!" : "Copy link"}
                  </button>
                </div>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 6 }}>Share this link for your partner to join the household.</div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Danger zone ── */}
      <section>
        <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>Reset</div>
        <p style={{ fontSize: "var(--step--1)", color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.6 }}>
          Clear all your inputs and restart the onboarding flow. This can't be undone.
        </p>
        <button
          onClick={resetToDefaults}
          className="btn btn--outline btn--sm"
          style={{ borderColor: "oklch(65% 0.12 25)", color: "oklch(42% 0.14 25)" }}
        >
          Reset all data
        </button>
      </section>

    </div>
  );
}
