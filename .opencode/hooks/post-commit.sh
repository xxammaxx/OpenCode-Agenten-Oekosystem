# Post-Commit Hook
# Logs commit to audit trail and updates session state.

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_HASH=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B)

AUDIT_ENTRY=$(cat <<EOF
{"timestamp":"$TIMESTAMP","session_id":"${SESSION_ID:-unknown}","agent":"${AGENT:-unknown}","action":"git_commit","commit":"$COMMIT_HASH","message":"$COMMIT_MSG"}
EOF
)

echo "$AUDIT_ENTRY" >> .opencode/logs/audit/audit-$(date +%Y-%m-%d).jsonl
echo "Post-commit audit logged. Commit: $COMMIT_HASH"
