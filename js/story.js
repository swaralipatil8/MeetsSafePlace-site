/*
==================================================
 Meet's Safe Place
 Story Timeline Loader
==================================================
*/

document.addEventListener("DOMContentLoaded", () => {
  const timeline = document.getElementById("timeline");
  if (!timeline) return;

  fetch("data/timeline.json")
    .then(response => response.json())
    .then(data => {
      data.forEach((item) => {
        const card = document.createElement("article");
        card.className = "timeline-card glass-card fade-up";

        card.innerHTML = `
          <div class="timeline-content" style="margin-top: var(--space-sm); margin-bottom: var(--space-sm);">
            <h3 class="handwritten">${item.title}</h3>
            <p class="small">${item.note}</p>
            <div class="small text-muted">${item.handwritten}</div>
          </div>
        `;

        timeline.appendChild(card);
      });
    })
    .catch(error => {
      console.error("Timeline loading error:", error);
    });
});
