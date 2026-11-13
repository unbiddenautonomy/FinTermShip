// Tests run with every term card and pack loaded, as if the learner had reached the whole syllabus.
// A test about cards arriving clears them first (clearCards) and loads what it needs.
import { buildCards, buildPacks } from '../lib/cardData';
import { applyCards } from '../lib/content';
import { applyPacks } from '../lib/packs';

applyCards(Object.fromEntries(buildCards()));
applyPacks(Object.fromEntries(buildPacks()));
