---
description: "🎨 Expo / frontend — surface-layer coding rules"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🎨 Expo / frontend — surface-layer coding rules

> **Scope: React Native apps on Expo (expo-router).** If it is not Expo, treat this document as inapplicable and discard it.
>
> **The common rules are [common/coding.md](common-coding.instructions.md)** (formatting is the tool's; never weaken types to get to green;
> no default exports, no barrels, path aliases; secrets and `EXPO_PUBLIC_`; the boundary on native dependencies).
> This document defines, **on top of following those**, only the delta that binds React Native's surface. It never restates the common side.
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what the RN runtime can and cannot do)

The React Native runtime **is neither a browser nor Node.**

There is no DOM. No CSS cascade, no inheritance, no selectors, no media queries.
`document` / `window` / `localStorage` / `alert` are absent or are something else entirely.
Parts of `Buffer` / `crypto` / `Intl` are absent or behave differently per platform.

**The biggest source of accidents is that JSX looks exactly like it does on the Web.**
Because you can write code that looks the same, you get the illusion that Web knowledge carries over —
and **a mistake that would be a layout glitch on the Web becomes a runtime crash here, or silence on one platform.**

**This document's job is to close the loopholes that the identical appearance leaves open.**

---

## 1. A bare string can only go inside `<Text>`

A string appearing directly under a `<View>` **crashes at runtime** (`Text strings must be rendered within a <Text> component`).
The same code that renders without incident in React on the Web kills the app here.

What is dangerous is not a string you wrote deliberately but **a string leaking out of a conditional**.

```tsx
//  NG: count が 0 のとき、0 が View の直下に落ちてクラッシュする
<View>{count && <Badge count={count} />}</View>

//  NG: 空文字・スペースも同じく落ちる
<View>{isNew && ' '}</View>

//  OK: 三項で書き、出さない場合は明示的に null
<View>{count > 0 ? <Badge count={count} /> : null}</View>
```

**Write conditional rendering with a ternary and an explicit `null`, not with `&&`.**
Fixing the shape is cheaper than thinking every time about whether the left side of `&&` could be a number or an empty string.

---

## 2. Styles are not CSS

### Put them in `StyleSheet.create`

**Never create a style object literal inside the JSX every time.**
A new reference is born on every render, unconditionally defeating `React.memo`'s avoided re-renders on a child.
Do this in a list's row component and every row re-renders on every scroll.

```tsx
//  NG: 毎レンダで新しいオブジェクト
<View style={{ padding: 16, backgroundColor: '#fff' }} />

//  OK: 定義は外、条件付きは配列で合成
<View style={[styles.card, isActive && styles.cardActive]} />
```

### Never bring CSS common sense with you

| What you assume on the Web | In React Native |
| --- | --- |
| Styles cascade and inherit | **They do not.** Only some text styles inherit through nested `<Text>` |
| `flexDirection` defaults to `row` | **It defaults to `column`** |
| `position: fixed` exists | **It does not.** Pin to the screen with absolute positioning plus layout structure |
| One `box-shadow` produces a shadow | **iOS uses `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`; Android uses `elevation`. Write only one and the shadow disappears on the other** |
| A container's `padding` affects its contents | On a `ScrollView` it goes in **`contentContainerStyle`** (in `style` it has no effect) |
| `text-overflow: ellipsis` | Specify it through the **`numberOfLines` prop** |
| `gap` / `%` / `vh` are available | `gap` works but there is no `vh`. Get screen dimensions from `useWindowDimensions` |

**When your hands move because "on the Web you write it like this", stop and check the table above.**

---

## 3. Vary the means of platform branching by the size of the difference

| Size of the difference | Means |
| --- | --- |
| A few values differ (spacing, fonts, shadows) | use `Platform.select` / `Platform.OS` inside the expression |
| **The component's structure differs entirely, or only one side carries a native dependency** | **split into `Foo.ios.tsx` / `Foo.android.tsx`** (the bundler resolves it; the import side stays `./Foo`) |

**When you split into files, both files must have the same props type and the same export name.**
A breakage where only one side's signature changes goes unnoticed until you build for the other platform, making it
**the defect that surfaces latest**. Put the props type in a shared file and import it from both.

Write a `Platform.OS === 'web'` branch **only when the project has decided to ship Expo Web**.
If that is undecided, do not write it (a branch for a requirement that does not exist rots unverified).

---

## 4. The screen's edges — safe area and the keyboard

**Neither is optional, and CSS cannot substitute for either.** Miss them and it breaks only on a real device.

### Safe area

- **Use `react-native-safe-area-context`** (`useSafeAreaInsets`, or that library's `SafeAreaView`)
- **Never use the `SafeAreaView` imported from `react-native`.** It is iOS-only and **does nothing on Android**, so
  it slips under the notch or the gesture bar on one platform only
- On a screen with a header or tabs, **never add the insets twice**. Exclude with `edges` the sides the navigator already consumed
  (that is the cause of unnatural padding at the top and bottom)

### The keyboard

Build a design where input is not hidden by the keyboard **from the start** on any screen with input (otherwise you end up rebuilding the layout afterwards).

**Put `keyboardShouldPersistTaps="handled"` on any `ScrollView` containing input.**
Without it, **the first tap while the keyboard is up is consumed by dismissing the keyboard and the button does not respond.**
It gets reported only as "sometimes it doesn't press", and it is a defect hard to reproduce even in review.

---

## 5. Accessibility and testID are things you "emit"

**RN has no semantic elements.** Neither `<Pressable>` nor `<View>` announces what it is.
Nothing is decided automatically from markup as on the Web, so **emit it explicitly.**

| Target | What to attach |
| --- | --- |
| Anything pressable | `accessibilityRole` (`button` / `link` / `checkbox`, and so on) |
| An element with only an icon and no text | `accessibilityLabel` (write what it does, not the icon's name) |
| States such as disabled, selected, expanded | `accessibilityState` (never express it through appearance alone) |
| A tap area smaller than 44pt | `hitSlop` (widen only the hit area, leaving the appearance) |

On top of that, **attach a stable `testID` to anything pressable and anything you want to identify in tests.**
**Name the value for the function, not by copying the displayed text** (so a wording change does not break the test).

```tsx
//  NG: 何も名乗らない。読み上げでは無反応、テストからも引けない
<Pressable onPress={onSubmit}><Icon name="check" /></Pressable>

//  OK
<Pressable
  onPress={onSubmit}
  accessibilityRole="button"
  accessibilityLabel="送信する"
  accessibilityState={{ disabled: isSubmitting }}
  testID="submit-button"
  hitSlop={8}
>
  <Icon name="check" />
</Pressable>
```

> The attributes emitted here become the means of identification for a11y and for future FE tests.
> **No FE testing leaf is placed for now** (develop does not file FE tests).

---

## ✅ Checklist before returning

- [ ] Is any conditional rendering with `&&` left? (is it a ternary + `null`?)
- [ ] Are you writing style object literals inside the JSX?
- [ ] Wherever you added a shadow, did you specify both the iOS and the Android side?
- [ ] If you split into `.ios.tsx` / `.android.tsx`, do both have the same props type and export name?
- [ ] Are you getting the safe area from `react-native-safe-area-context` (and not `react-native`'s `SafeAreaView`)?
- [ ] Did you put `keyboardShouldPersistTaps="handled"` on a `ScrollView` containing input?
- [ ] Does everything pressable have an `accessibilityRole` and (if it has no text) an `accessibilityLabel`?
- [ ] Did you express state through `accessibilityState` as well as appearance?
- [ ] Is `testID` named for the function rather than the displayed text?
