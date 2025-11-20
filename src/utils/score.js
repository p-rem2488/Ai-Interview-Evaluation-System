// Simple Levenshtein + WER functions
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i)=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

export function wordErrorRate(ref, hyp) {
  const ra = ref.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ha = hyp.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (ra.length === 0) return 1.0;
  const edits = levenshtein(ra, ha);
  return edits / ra.length;
}
