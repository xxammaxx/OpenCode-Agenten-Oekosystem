# Pre-Task Hook (before subagent launch)
# Validates delegation rules and logs the delegation event.

PARENT_AGENT="${PARENT_AGENT:-unknown}"
CHILD_AGENT="$1"
TASK_DESCRIPTION="$2"

# Delegation Rules Matrix
case "$PARENT_AGENT" in
  "issue-orchestrator")
    ALLOWED="review-agent research-agent compliance-agent migration-agent playwright-agent architecture-agent security-agent documentation-agent"
    ;;
  "security-agent")
    ALLOWED="research-agent issue-orchestrator"
    ;;
  *)
    ALLOWED=""
    ;;
esac

if [[ ! " $ALLOWED " =~ " $CHILD_AGENT " ]]; then
  echo "BLOCKED: $PARENT_AGENT is not allowed to delegate to $CHILD_AGENT"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DELEGATION_LOG=$(cat <<EOF
{"timestamp":"$TIMESTAMP","parent_agent":"$PARENT_AGENT","child_agent":"$CHILD_AGENT","task":"$TASK_DESCRIPTION"}
EOF
)

echo "$DELEGATION_LOG" >> .opencode/logs/audit/delegations-$(date +%Y-%m-%d).jsonl
echo "Delegation approved: $PARENT_AGENT -> $CHILD_AGENT"
