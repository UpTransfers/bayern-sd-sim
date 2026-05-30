export type FormationKey = "4-2-3-1" | "4-3-3" | "3-4-2-1" | "3-5-2" | "4-4-2" | "4-1-4-1";

export const formationOptions: FormationKey[] = [
  "4-2-3-1",
  "4-3-3",
  "3-4-2-1",
  "3-5-2",
  "4-4-2",
  "4-1-4-1",
];

export function formationSlots(formation: FormationKey) {
  switch (formation) {
    case "4-3-3":
      return ["GK", "LB", "LCB", "RCB", "RB", "LCM", "CM", "RCM", "LW", "ST", "RW"];
    case "3-4-2-1":
      return ["GK", "LCB", "CB", "RCB", "LWB", "LCM", "RCM", "RWB", "LAM", "RAM", "ST"];
    case "3-5-2":
      return ["GK", "LCB", "CB", "RCB", "LWB", "LCM", "CM", "RCM", "RWB", "ST1", "ST2"];
    case "4-4-2":
      return ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCM", "RCM", "RM", "ST1", "ST2"];
    case "4-1-4-1":
      return ["GK", "LB", "LCB", "RCB", "RB", "DM", "LM", "LCM", "RCM", "RM", "ST"];
    case "4-2-3-1":
    default:
      return ["GK", "LB", "LCB", "RCB", "RB", "DM1", "DM2", "LW", "AM", "RW", "ST"];
  }
}

export function benchSlots(formation: FormationKey) {
  void formation;
  return ["GK", "DEF1", "DEF2", "MID1", "MID2", "ATT1", "ATT2"];
}
