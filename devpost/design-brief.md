---
status: approved
---

# Design brief: TapLine

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

TapLine is a Lens for new rubber tappers in Malaysia. Tapping happens before dawn, in the dark, with a knife in one hand. New tappers often cut too deep or at the wrong angle, which damages the bark for years. TapLine draws the correct cut line on the trunk at the right height and angle, and uses sound to guide the tapper to the next tree. Their hands stay on the knife and their eyes stay on the tree.

## The one spatial moment
I walk up to the tree in the dark and stop about an arm's length away. A thin glowing line appears on the trunk where I should cut: starting at about 120 cm high on the left, sloping down to the right at about 30 degrees, following the old cut so I only shave a thin strip. I tap along the line, pinch the end mark to say "done", the line fades, and a soft "tok" from the next tree tells me where to go.

## Why it belongs on glasses
- Uses: draws in the world, leaves your body free, shares your view (in the real version, the line follows the old cut on the trunk you're looking at).
- Why it's better than the phone or laptop version: you can't hold a phone while tapping. One hand holds the knife, the other works the tree, and it's dark. The guide has to sit on the bark itself, and directions to the next tree have to come as sound, not as a map you look down at.

## Product or overlay
- Type: overlay. It responds to a real tree and its old cut.
- What the real version would sense: the rubber tree trunk and the old tapping cut on its bark, so the line can follow it.
- Stand-in for the preview: three virtual rubber trees in the room, each with the old cut already drawn on its bark. **Pinching the trunk** stands in for "I'm at this tree." That pinch is what starts the guide. The line is placed using each virtual tree's old cut, which is set in advance.

## Where things live
- Where the user is looking during the main task: at the trunk, about an arm's length away, around 120 cm high (a little below eye level), where the knife is working.
- Starting position: the user starts about 2.5 m in front of Tree 1, facing it, so the trunk glow visibly appears as they walk up.
- Tree 1: straight ahead of the start.
- Tree 2: about 3 m from Tree 1, off to the user's right side, out of view while standing at Tree 1.
- Tree 3: about 3 m from Tree 2, behind the user while standing at Tree 2, so the "tok" and arrow have to point to a tree they can't see.
- Trunks: about 25 to 30 cm wide. Visible trunk height about 3 m (default), standing on the floor at real scale. Bark colored light enough to read in the preview (default).
- Old cut: already on the bark of each tree, as a sloping groove just above where the new line goes.
- Cut guide line: thin and glowing, about 1 cm thick (default). It sits on the trunk surface and starts at about 120 cm high on the left, sloping down to the right at about 30 degrees. It follows just below the old cut so only a thin strip is shaved. It runs across the half of the trunk facing the user (default). Bright warm white/yellow (default), so it shows on the additive display.
- Start mark: small, about 2 cm (default), at the top-left start of the line.
- End mark: at the bottom-right where the cut finishes, about 5 cm so it's easy to pinch.
- Tip note: short text on the trunk just above the line, light colored, readable from arm's length, about 3 cm tall letters (default).
- Direction arrow: small, at the edge of the user's view, pointing toward the next tree.
- "3 of 3 trees done" message: small, shown near the last tree at about eye level (default).

## Hands and input
- "I'm at this tree": pinch the trunk with one hand (the knife stays in the other). The trunk is a big target. It only responds when the user is within about 1.5 m and the trunk is glowing (default).
- "Done": pinch the end mark at the bottom-right of the line. It's where the knife naturally finishes and it's away from the start of the line, so it won't be hit by accident while tapping.
- The knife cutting itself is not sensed. The user taps along the line, then pinches the end mark.
- Targets are big and highlight when aimed at.
- Voice: none.

## When things show
- Trunk glow: faint glow when the user walks within about 1.5 m of a tree that hasn't been tapped. It turns off when they walk away.
- Cut guide line and marks: appear when the trunk is pinched and stay while tapping. They fade away when the end mark is pinched, leaving the trunk clear again.
- Tip note: appears with the guide, stays for about 4 seconds, then fades out on its own while the line stays. The notes are hard-coded for each tree:
  - Tree 1: "Thin shave — stay under 1 mm"
  - Tree 2: "Bark was cut too deep last time — go shallower"
  - Tree 3: "Follow the old cut — keep the 30° slope"
- Trees are done in order: 1, then 2, then 3 (default). A finished tree doesn't glow or start again (default).
- "Tok" sound: a soft spatial "tok" plays from the next tree's position when the end mark is pinched.
- Direction arrow: shows at the edge of view only if the next tree is out of view, and disappears once it's in view.
- No tree counter during tapping. After the third tree, a small "3 of 3 trees done" message appears and then fades.
- If something needs attention out of view: the spatial "tok" from the next tree, plus a small arrow at the edge of view.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. Walking within about 1.5 m of a tree makes that trunk glow faintly; walking away turns the glow off.
2. Pinching the trunk shows the cut guide on that trunk: a glowing line starting about 120 cm high on the left, sloping down to the right at about 30 degrees, with a start mark and a bigger end mark, plus that tree's tip note above it.
3. The tip note fades out on its own after about 4 seconds, while the guide line stays.
4. Pinching the end mark fades the guide away and plays a "tok" sound from the next tree; if that tree is out of view, a small arrow at the edge of my view points to it, and the arrow disappears once the tree is in view.
5. After finishing the third tree, a small "3 of 3 trees done" message appears and then fades.

## Out of scope
- Recognizing real rubber trees or reading the real old cut with the camera.
- Sensing the knife, cut depth, or cut angle, or giving feedback on how well the user cut.
- Real plantation layout, GPS, or walking routes beyond the three virtual trees.
- Remembering progress between sessions (for example, which trees were tapped yesterday).
- Voice commands.

## Risks and open questions
- On real glasses, lining up the line with the real old cut would need camera vision and precise tracking on the trunk. Feel unproven.
- Tapping happens before dawn in the dark. Glasses tracking and hand tracking may struggle in very low light. Only real glasses can answer this.
- Pinching a trunk or a 5 cm mark with one hand while holding a knife, and working at about 120 cm for a whole row of trees, needs testing for comfort over time. Feel unproven.
- At an arm's length, the narrow view of SPECS may not show the whole line and the tip note at once. Check this in the preview.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
