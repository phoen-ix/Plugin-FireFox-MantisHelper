# Screenshots

Every page Mantis Helper shows, in Firefox. The context menu entry itself (**Open “…” in Mantis**) is
browser UI and cannot be captured. Regenerate the images with `scripts/docs-screenshots.sh` (see the
[README](../../README.md#screenshots)).

## Options: not configured yet

The options page as it first opens, also when "Open in Mantis" is used before a Mantis URL is set. The
line under the field explains what to enter.

<img src="options-empty.png" alt="Options page with an empty Mantis URL field and the hint to enter the address of the Mantis installation" width="800">

## Options: unusable URL

An address without `http://` or `https://` is rejected: the hint stays, and **Save** does not store it.

<img src="options-invalid.png" alt="Options page with mantis.example.com typed into the Mantis URL field and the hint still shown" width="800">

## Options: saved

After **Save**, the base address has `view.php?id=` appended, the line under the field shows which
address an issue number opens, and "Options saved." confirms it.

<img src="options-saved.png" alt="Options page with https://mantis.example.com/view.php?id= saved, the preview for issue 1234 and the confirmation Options saved." width="800">

## Invalid selection

Opens in a new tab when the selection has no single issue number, e.g. "Issues 12 and 34".

<img src="menu-invalid-selection.png" alt="Hint page Invalid selection: no single issue number found in the selection" width="800">
