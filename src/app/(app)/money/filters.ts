/** A date typed as YYYY-MM-DD means that whole day in Jakarta, not UTC. */
export function jakartaRange(from: string, to: string) {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  return {
    from: valid(from) ? `${from}T00:00:00+07:00` : null,
    to: valid(to) ? `${to}T23:59:59.999+07:00` : null,
  };
}
