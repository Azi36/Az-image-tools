import { useState } from "react";
import { observer } from "mobx-react-lite";
import { BookmarkPlus, Check, Trash2, X } from "lucide-react";
import style from "./index.module.scss";
import { gstate } from "@/global";
import { homeState } from "@/states/home";
import { Select } from "@/components/Select";
import { BUILTIN_PRESETS, findMatchingPreset, MAX_USER_PRESETS, type Preset } from "@/presets";
import { toJS } from "mobx";

function presetName(preset: Preset) {
  if (preset.nameKey) {
    return gstate.locale?.presets.names[preset.nameKey] ?? preset.nameKey;
  }
  return preset.name ?? "";
}

/**
 * 预设选择框：一键套用常见交付场景的参数，也能把当前这套存下来。
 * 选预设只写进草稿，和面板里其它改动一样要按「确定」才生效。
 *
 * 以前这里是一排 chip，内置加自定义能堆到十几个，把面板顶掉半屏；
 * 换成选择框以后固定一行，初始就停在「默认」上。
 */
export const PresetBar = observer(() => {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const disabled = homeState.hasTaskRunning();
  const presets = [...BUILTIN_PRESETS, ...homeState.userPresets];
  const active = findMatchingPreset(toJS(homeState.tempOption), homeState.userPresets);
  const full = homeState.userPresets.length >= MAX_USER_PRESETS;
  const removable = active && !active.builtin;

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

      <div className={style.pickRow}>
        <Select
          value={active?.id}
          options={presets.map((preset) => ({ value: preset.id, label: presetName(preset) }))}
          /* 参数被手动改过就不属于任何预设，占位符如实说是「自定义」 */
          placeholder={gstate.locale?.presets.custom}
          ariaLabel={gstate.locale?.presets.label}
          disabled={disabled}
          onChange={(id) => {
            const preset = presets.find((item) => item.id === id);
            if (preset) homeState.applyPreset(preset);
          }}
        />
        {removable && (
          <button
            type="button"
            className={style.removeButton}
            aria-label={gstate.locale?.presets.remove}
            title={gstate.locale?.presets.remove}
            disabled={disabled}
            onClick={() => homeState.removePreset(active.id)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
});
