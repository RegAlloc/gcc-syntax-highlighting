

## ToDo features

- implement source to rtl
- RTL, click instruction to jump to definition in .md
- The "Liveness" Heatmap (Register Allocation Focus)
	- Since your handle is RegAlloc, this might be closer to your heart. RTL dumps are long; it's hard to see where register pressure spikes.

	- The Idea: A "Heatmap" in the editor gutter (next to line numbers).

	- The Logic: We crudely count the number of active pseudos between defs and deaths.

	- The Output: The gutter color changes from Green (low pressure) to Red (high pressure) as you scroll through the function.

	- Why: You can spot "Spill Zones" instantly just by scrolling.
