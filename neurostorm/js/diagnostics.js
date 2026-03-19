import { ARCHETYPES } from "./data.js";

/** @param {object} s — статистика сессии из Game.getStats() */
export function computeArchetype(s) {
  const trapHits = s.trapHits;
  const energyEnd = s.energyEnd;
  const timeEnd = s.timeEnd;
  const caution = s.forkCaution;
  const bold = s.forkBold;
  const margin = s.forkMargin;
  const highValue = s.highValueCaught;
  const comboMax = s.comboMax;
  const boosters = s.boosterCaught;
  const goodCaught = s.goodCaught;

  // Перегруженный: мало энергии + много ловушек + время просело
  if (energyEnd < 28 && trapHits >= 3 && timeEnd < 52) {
    return ARCHETYPES.burnout;
  }

  // Осторожный: осторожность доминирует, мало маржинальных выборов
  if (caution >= bold + 2 && margin <= 1 && highValue < 4) {
    return ARCHETYPES.cautious;
  }

  // Монетизатор: тянет к деньгам, хорошие комбо, смелые развилки
  if (highValue >= 4 && comboMax >= 2 && bold >= caution && margin >= 2) {
    return ARCHETYPES.monetizer;
  }

  // Ускоритель: мало ловушек, много бустеров, энергия держится
  if (trapHits <= 2 && boosters >= 3 && energyEnd >= 58 && goodCaught >= 10) {
    return ARCHETYPES.accelerator;
  }

  return ARCHETYPES.balanced;
}
