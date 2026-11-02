// Runs the benchmark in the page and writes the JSON result into <output id="benchmark">. Nothing is sent anywhere.
import { CASES, THREE_CASES, caseName, threeCaseName } from './cases.ts';
import { measureAll } from './measure.ts';
import { measureParameterStyle } from './parameter-style.ts';

const query = new URLSearchParams(location.search);
const output = document.getElementById('benchmark');
// A short delay lets the page finish loading before the timed loops start.
setTimeout(() => {
  const caseGroup = query.get('cases') ?? 'all';
  const onlyNames = query.get('only')?.split(',') ?? null;
  const results = measureAll({
    repeats: Number(query.get('repeats') ?? 3),
    frames: Number(query.get('frames') ?? 1200),
    cases: caseGroup === 'three' ? [] : CASES.filter((benchCase) => !onlyNames || onlyNames.includes(caseName(benchCase))),
    threeCases: caseGroup === 'solver' ? [] : THREE_CASES.filter((threeCase) => !onlyNames || onlyNames.includes(threeCaseName(threeCase))),
  });
  if (!(output instanceof HTMLOutputElement)) return;
  output.textContent = JSON.stringify({ parameterStyle: measureParameterStyle(), results });
  output.dataset['state'] = 'done';
}, 50);
