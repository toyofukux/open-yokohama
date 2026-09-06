"""Verify the reviewed manuscript/source versions and selected numerical evidence.

Does not certify source meaning, human review, policy effects, or adoption.
Requires Python 3 and pdftotext. Never changes the evidence baseline.
"""

from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import unicodedata

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, value):
        self.parts.append(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def compact(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value))


def verify():
    evidence_bytes = (BASE / "evidence.json").read_bytes()
    evidence = json.loads(evidence_bytes)
    manuscript = (ROOT / evidence["manuscript"]["path"]).read_bytes()
    require(sha256(manuscript).hexdigest() == evidence["manuscript"]["sha256"],
            "Manuscript changed: review this version before updating evidence.json")
    sources = {item["id"]: item for item in evidence["sources"]}
    require(len(sources) == len(evidence["sources"]), "Duplicate source IDs")
    for item in sources.values():
        raw = (ROOT / item["localPath"]).read_bytes()
        require(sha256(raw).hexdigest() == item["sha256"], f"Source hash: {item['id']}")
        require(len(raw) == item["bytes"], f"Source size: {item['id']}")

    claims = {item["id"]: item for item in evidence["claims"]}
    require(len(claims) == len(evidence["claims"]), "Duplicate claim IDs")
    content = manuscript.decode()
    mentioned = set(" ".join(re.findall(r"<!-- (.*?) -->", content)).split())
    require(mentioned == set(claims), "Manuscript claim anchors and ledger differ")
    for item in claims.values():
        for support in item.get("evidence", []):
            require(support["sourceId"] in sources and bool(support["locator"]),
                    f"Missing evidence: {item['id']}")
        for dependency in item.get("dependsOn", []):
            require(dependency in claims, f"Missing dependency: {item['id']}")
    definitions = dict(re.findall(r"^\[(S\d+)\]: (\S+)$", content, re.M))
    used = set(re.findall(r"\]\[(S\d+)\]", content))
    require(used == set(definitions), "Unresolved or unused source references")
    for sid, url in definitions.items():
        require(url.split("#")[0] == sources[sid]["url"], f"Source URL mismatch: {sid}")

    def html(sid):
        parser = TextOnly()
        parser.feed((ROOT / sources[sid]["localPath"]).read_text())
        return compact(" ".join(parser.parts))

    def pdf_page(sid, page, preserve_space=False):
        result = subprocess.run(
            ["pdftotext", "-f", str(page), "-l", str(page), "-layout",
             str(ROOT / sources[sid]["localPath"]), "-"],
            check=True, capture_output=True, text=True)
        return unicodedata.normalize("NFKC", result.stdout) if preserve_space else compact(result.stdout)

    # Read the charge from the archived guidance, not a copied expected result.
    fee_match = re.search(r"保護者負担額:([0-9,]+)円/食", html("S1"))
    require(fee_match is not None, "Cannot locate middle-school meal charge")
    fee = int(fee_match[1].replace(",", ""))
    example_meals = 20  # Editorial scenario, not an observed monthly meal count.
    example_yen = fee * example_meals
    require(f"**{example_yen:,}円**" in content, "Household example differs from source calculation")

    page = pdf_page("S7", 31)
    ingredient = re.search(r"1人あたり([0-9,]+)円/月", page)
    benchmark = re.search(r"基準額([0-9,]+)円/月", page)
    supplement = re.search(r"差額([0-9,]+)円", page)
    require(all([ingredient, benchmark, supplement]), "Cannot locate elementary funding split")
    a, b, c = (int(match[1].replace(",", "")) for match in [ingredient, benchmark, supplement])
    require(a - b == c, "Elementary funding split does not reconcile")

    budget_page = pdf_page("S4", 3, preserve_space=True)
    # The two expense rows explain why this budget is not a universal-fee waiver cost.
    first = re.search(r"中学校給食物資購入事業\s+1\s+([0-9,]+)", budget_page)
    second = re.search(r"小学校給食室改修期間中の中学校給食提供物資購入\s+2\s+事業\s+([0-9,]+)", budget_page)
    total = re.search(r"細事業合計\s+([0-9,]+)", budget_page)
    require(all([first, second, total]), "Cannot locate budget expense rows")
    middle_thousand = int(first[1].replace(",", ""))
    total_thousand = int(total[1].replace(",", ""))
    elementary_thousand = int(second[1].replace(",", ""))
    require(middle_thousand + elementary_thousand == total_thousand, "Budget rows do not reconcile")
    require("小学校給食室改修期間中" in budget_page, "Budget scope locator changed")

    return {
        "result": "passed",
        "manuscriptSha256": sha256(manuscript).hexdigest(),
        "evidenceSha256": sha256(evidence_bytes).hexdigest(),
        "sourceVersionsChecked": len(sources),
        "claimAnchorsChecked": len(claims),
        "sourceLinksChecked": len(definitions),
        "calculations": {
            "householdExample": {"yenPerMeal": fee, "assumedMeals": example_meals, "yen": example_yen},
            "elementaryIngredientsPerMonth": {"yen": a, "nationalBenchmarkYen": b, "citySupplementYen": c},
            "initialBudgetRowsThousandYen": {
                "middleIngredients": middle_thousand,
                "elementaryTemporarySupply": elementary_thousand,
                "total": total_thousand,
                "notIncrementalWaiverCost": True,
            },
        },
        "limits": [
            "Source versions, anchor references and selected arithmetic only",
            "Not a live link check or exhaustive sentence-level fact check",
            "This check does not certify independent review, human validation, adoption or publication",
        ],
    }


if __name__ == "__main__":
    try:
        report = verify()
    except Exception as error:
        report = {"result": "failed", "error": str(error)}
    report["checkedAt"] = datetime.now(timezone.utc).isoformat()
    report["verifierSha256"] = sha256(Path(__file__).read_bytes()).hexdigest()
    (BASE / "checks.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["result"] == "passed" else 1)
