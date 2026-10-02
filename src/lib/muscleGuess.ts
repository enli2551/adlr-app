// Fallback muscle group for exercises that aren't in the library — imported Hevy/Strong
// names ("Iso-Laterales Rudern (Maschine)") or custom free-workout entries. Without it they
// all land in "Sonstige" and can top the weekly muscle chart. Order matters: specific
// patterns (leg curl, knee raise, reverse fly…) come before the broad ones.

const RULES: [RegExp, string][] = [
  [/knieheben|beinheben|leg raise|knee raise|crunch|plank|sit-?up|bauch|ab wheel|rollout|russian twist/i, 'Core'],
  [/aufwärmen|warm.?up|laufband|treadmill|lauf|running|fahrrad|bike|cycling|crosstrainer|elliptical|stepper|stair|rudergerät|rowing machine|seilspring|jump rope/i, 'Cardio'],
  [/rumänisch|romanian|beinbeug|beincurl|leg curl|waden|calf|hip thrust|glute|adduk|abduk|adduct|abduct/i, 'Beine'],
  [/reverse fl|rear delt|face pull|seitheben|lateral raise|schulter|shoulder|overhead press|military|arnold|landmine|frontheben|front raise|upright row|shrug/i, 'Schultern'],
  [/curl|bizeps|biceps|trizeps|triceps|stirndrück|skull|pushdown|kickback|dip/i, 'Arme'],
  [/rudern|row|klimmzug|pull.?up|chin.?up|latzug|pulldown|lat pull|kreuzheben|deadlift|hyperextension|(?:^|[\s-])rücken|back ext/i, 'Rücken'],
  [/bein|squat|kniebeug|ausfall|lunge|leg press|leg ext|hackenschmidt|hack squat|pendulum|step.?up/i, 'Beine'],
  [/bank|brust|butterfly|fliegende|fly|chest|bench|liegestütz|push.?up|crossover|pec/i, 'Brust'],
];

export function guessMuscle(name: string): string | null {
  for (const [re, group] of RULES) if (re.test(name)) return group;
  return null;
}
