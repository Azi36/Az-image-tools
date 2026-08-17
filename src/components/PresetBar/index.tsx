import { useState } from "react";
import { observer } from "mobx-react-lite";
import { BookmarkPlus, Check, X } from "lucide-react";
import style from "./index.module.scss";
import { gstate } from "@/global";
import { homeState } from "@/states/home";
import { BUILTIN_PRESETS, findMatchingPreset, MAX_USER_PRESETS, type Preset } from "@/presets";
import { toJS } from "mobx";

function presetName(preset: Preset) {
  if (preset.nameKey) {
    return gstate.locale?.presets.names[preset.nameKey] ?? preset.nameKey;
  }
  return preset.name ?? "";
}

/**
 * 预设条：一键套用常见交付场景的参数，也能把当前这套存下来。
 * 点预设只写进草稿，和面板里其它改动一样要按「确定」才生效。
 */
export const PresetBar = observer(() => {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const disabled = homeState.hasTaskRunning();
  const active = findMatchingPreset(toJS(homeState.tempOption), homeState.userPresets);
  const full = homeState.userPresets.length >= MAX_USER_PRESETS;

  const save = () => {
    if (homeState.saveCurrentAsPreset(name)) {
      setNaming(false);
      setName("");
    }
  };

  return (
    <div className={style.container}>
      <div className={style.head}>
        <span className={style.label}>{gstate.locale?.presets.label}</span>
        {!naming && (
          <button
            type="button"
            className={style.saveButton}
            disabled={disabled || full}
            title={full ? gstate.locale?.presets.limitReached : undefined}
            onClick={() => setNaming(true)}
          >
            <BookmarkPlus size={14} />
            {gstate.locale?.presets.save}
          </button>
        )}
      </div>

      {naming && (
        <div className={style.namingRow}>
          <input
            className={style.nameInput}
            autoFocus
            maxLength={20}
            value={name}
            placeholder={gstate.locale?.presets.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
          />
          <button
            type="button"
            className={style.iconOk}
            aria-label={gstate.locale?.presets.confirm}
            disabled={name.trim().length === 0}
            onClick={save}
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            className={style.iconCancel}
            aria-label={gstate.locale?.presets.cancel}
            onClick={() => { setNaming(false); setName(""); }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className={style.chips}>
        {[...BUILTIN_PRESETS, ...homeState.userPresets].map((preset) => (
          <span
            key={preset.id}
            className={active?.id === preset.id ? style.chipActive : style.chip}
          >
            <button
              type="button"
              disabled={disabled}
              aria-pressed={active?.id === preset.id}
              onClick={() => homeState.applyPreset(preset)}
            >
              {presetName(preset)}
            </button>
            {!preset.builtin && (
              <button
                type="button"
                className={style.remove}
                aria-label={gstate.locale?.presets.remove}
                title={gstate.locale?.presets.remove}
                disabled={disabled}
                onClick={() => homeState.removePreset(preset.id)}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
});
