// Tests run with every term card loaded, as if the learner had reached the whole syllabus.
// A test about cards arriving clears them first (clearCards) and loads what it needs.
import { buildCards } from '../lib/cardData';
import { applyCards } from '../lib/content';

applyCards(Object.fromEntries(buildCards()));
