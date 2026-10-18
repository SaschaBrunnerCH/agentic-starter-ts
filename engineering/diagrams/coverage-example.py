"""Optional documentation example: python coverage-example.py (Matplotlib 3.10.7)."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

folder = Path(__file__).resolve().parent
data = json.loads((folder / "coverage-example.json").read_text())
rows = data["metrics"]
# Use the reported percentages: the coverage reporter truncates rather than rounds.
values = [row["percent"] for row in rows]

with plt.rc_context({"font.family": "sans-serif", "svg.fonttype": "none",
                     "font.sans-serif": ["DejaVu Sans", "Arial", "sans-serif"],
                     "svg.hashsalt": "coverage-example"}):
    fig, ax = plt.subplots(figsize=(9, 4.5), layout="constrained")
    ax.barh([row["name"] for row in rows], values, color="#1971C2", label="Measured")
    ax.scatter([row["floor"] for row in rows], range(len(rows)), color="#0F172A",
               marker="|", s=260, linewidths=2.5, label="Required floor", zorder=3)
    for index, value in enumerate(values):
        ax.text(2, index, f"{value:.2f}%", va="center", color="white", weight="bold")
    ax.invert_yaxis()
    ax.set(xlim=(0, 100), xlabel="Instrumented unit-test coverage (%)",
           title=f"Recorded coverage · {data['date']} · {data['commit'][:7]}")
    ax.legend(loc="lower left", bbox_to_anchor=(0, -0.38), ncols=2, frameon=False)
    fig.supxlabel("One recorded run; excludes command orchestration. No browser/GPU claim.",
                  fontsize=10)
    fig.savefig(folder / "coverage-example.svg", metadata={
        "Title": "Recorded unit-test coverage and required floors",
        "Description": data["scope"], "Date": data["date"],
    })
    plt.close(fig)

# Matplotlib emits spaces before SVG path line breaks; retain clean text diffs.
output = folder / "coverage-example.svg"
output.write_text("\n".join(line.rstrip() for line in output.read_text().splitlines()) + "\n")
