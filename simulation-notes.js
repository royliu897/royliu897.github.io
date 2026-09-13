const simulationNotes = document.getElementById("simulationNotes");
let pausedBeforeNotes = false;
document.getElementById("aboutSimulation").addEventListener("click", () => {
  pausedBeforeNotes = paused;
  setPaused(true);
  simulationNotes.showModal();
});
simulationNotes.addEventListener("close", () => setPaused(pausedBeforeNotes));
