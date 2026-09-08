"""Verify the reviewed manuscript/source versions and selected numerical evidence.

Does not certify source meaning, human review, policy effects, or adoption.
Requires Python 3 and pdftotext. Never changes the evidence baseline.
"""

from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import json
from decimal import Decimal, ROUND_HALF_UP
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

    content = manuscript.decode()
    require(manuscript == (BASE / "DRAFT-v0.4.1.md").read_bytes(),
            "Published manuscript differs from the adopted version")
    notes = {item["id"]: item for item in evidence["footnotes"]}
    require(len(notes) == len(evidence["footnotes"]) == 11, "Footnote inventory changed")
    definitions = re.findall(r"^\[\^(\d+)\]:", content, re.M)
    used = set(re.findall(r"\[\^(\d+)\](?!:)", content))
    require(len(definitions) == len(set(definitions)), "Duplicate footnote definitions")
    require(used == set(definitions) == set(notes), "Footnote references and ledger differ")
    for item in notes.values():
        require(bool(item["locator"]) and bool(item["scope"]), "Footnote scope missing")
        require(bool(item["sourceIds"]) and set(item["sourceIds"]) <= set(sources),
                "Footnote source missing")
    urls = {url.split("#")[0] for url in re.findall(r"\]\((https://[^)]+)\)", content)}
    require(urls == {item["url"] for item in sources.values()}, "Source URL coverage differs")
    figure = evidence["figure"]
    for path in [figure["path"], "apps/web/public/images/school-lunch/jnfs16-figure7-5.png"]:
        require(sha256((ROOT / path).read_bytes()).hexdigest() == figure["sha256"], "Figure changed")
    rights = figure["rights"]
    require(sha256((ROOT / rights["localPath"]).read_bytes()).hexdigest() == rights["sha256"],
            "Figure reuse terms changed")
    require("Open Yokohamaが原資料から図表部分を切り出した" in content,
            "Figure modification credit missing")

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

    fee_match = re.search(r"保護者負担額:([0-9,]+)円/食", html("P26"))
    require(fee_match is not None, "Cannot locate middle-school meal charge")
    fee = int(fee_match[1].replace(",", ""))
    planning = pdf_page("P25", 3)
    meals_match = re.search(r"給食実施日数:([0-9]+)日", planning)
    people_match = re.search(r"生徒・教職員数想定人数:([0-9,]+)人、([0-9,]+)人合計([0-9,]+)人", planning)
    require(meals_match is not None and people_match is not None, "Planning population missing")
    example_meals = int(meals_match[1])
    students, staff, people = (int(value.replace(",", "")) for value in people_match.groups())
    require(students + staff == people, "Planning population does not reconcile")
    example_yen = fee * example_meals
    require(f"{fee}円×{example_meals}食＝{example_yen:,}円" in content, "Household scenario differs")
    subsidy = re.search(r"に加え、([0-9]+)円/日を市が支援", pdf_page("P21", 21))
    require(subsidy is not None and f"{subsidy[1]}円" in content, "Subsidy missing from manuscript")
    survey = html("P14")
    for value in [679, 812, 1793]:
        require(str(value) in survey.replace(",", ""), f"Survey count missing: {value}")
    response_percent = round((679 + 812) / 1793 * 100, 1)
    require(f"{response_percent}%" in compact(content), "Response percentage differs")
    require("52.6%" in pdf_page("P20", 58), "Survey figure percentage missing")
    require("予定する子ども数が理想より少ない夫婦の52.6%" in compact(content),
            "Survey population qualifier missing")

    budget_page = pdf_page("P25", 3, preserve_space=True)
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

    budget = evidence["budgetScale"]
    budget_yen = middle_thousand * 1000
    per_person = Decimal(budget_yen) / people
    man_yen = str((per_person / 10000).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    oku_yen = str((Decimal(budget_yen) / 100000000).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    require(budget["budgetYen"] == budget_yen and budget["totalPlannedPeople"] == people,
            "Budget ledger differs from original")
    require(budget["students"] == students and budget["staff"] == staff, "Student/staff split differs")
    require(budget["excludedElementaryTemporarySupplyYen"] == elementary_thousand * 1000,
            "Excluded scope differs")
    require(budget["displayPerPersonManYen"] == man_yen and budget["displayBudgetOkuYen"] == oku_yen,
            "Rounded budget ledger differs")
    require(f"年約{man_yen}万円" in content and f"約{oku_yen}億円" in content, "Budget display differs")
    for condition in ["保護者から集める給食費", "生徒7.6万人＋教職員5千人", "2026年度当初計画・食材購入分",
                      "市に追加で必要となる額は、今回確認した資料では未確定", "改修中小学校分"]:
        require(condition in content, f"Budget scope missing: {condition}")
    return {
        "result": "passed",
        "manuscriptSha256": sha256(manuscript).hexdigest(),
        "evidenceSha256": sha256(evidence_bytes).hexdigest(),
        "sourceVersionsChecked": len(sources),
        "footnotesChecked": len(notes),
        "sourceLinksChecked": len(urls),
        "figureAndRightsHashesChecked": True,
        "calculations": {
            "householdExample": {"yenPerMeal": fee, "assumedMeals": example_meals, "yen": example_yen},
            "municipalityResponsePercent": response_percent,
            "initialBudgetRowsThousandYen": {
                "middleIngredients": middle_thousand,
                "elementaryTemporarySupply": elementary_thousand,
                "total": total_thousand,
                "notIncrementalWaiverCost": True,
            },
            "plannedPeople": {"students": students, "staff": staff, "total": people},
            "budgetPerPersonYen": str(per_person),
            "displayManYen": man_yen,
            "displayOkuYen": oku_yen,
        },
        "limits": [
            "Source versions, footnote references, image provenance and selected arithmetic only",
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
