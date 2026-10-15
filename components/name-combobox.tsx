'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface NameComboboxProps {
  id: string
  name: string
  value: string
  onValueChange: (value: string) => void
  /** All existing names, already de-duplicated and sorted. */
  options: string[]
  placeholder?: string
  maxLength?: number
}

/**
 * Text input with a real dropdown of existing names.
 * Typing filters the list (case-insensitive "contains"); the chevron (or ArrowDown) shows every name.
 */
export function NameCombobox({ id, name, value, onValueChange, options, placeholder, maxLength }: NameComboboxProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [active, setActive] = useState(-1)

  const query = value.trim().toLocaleLowerCase()
  const visible = showAll || !query ? options : options.filter((option) => option.toLocaleLowerCase().includes(query))
  const expanded = open && visible.length > 0

  function close() {
    setOpen(false)
    setShowAll(false)
    setActive(-1)
  }

  function select(option: string) {
    onValueChange(option)
    close()
    inputRef.current?.focus()
  }

  function toggle() {
    if (open) return close()
    inputRef.current?.focus()
    setShowAll(true)
    setActive(-1)
    setOpen(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setShowAll(!query)
        setActive(visible.length ? 0 : -1)
      } else if (visible.length) {
        setActive((index) => (index + 1) % visible.length)
      }
    } else if (event.key === 'ArrowUp') {
      if (!expanded) return
      event.preventDefault()
      setActive((index) => (index <= 0 ? visible.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      if (expanded && active >= 0) {
        event.preventDefault() // pick the highlighted name instead of submitting the form
        select(visible[active])
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        close()
      }
    } else if (event.key === 'Tab') {
      close()
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close()
      }}
    >
      <Input
        ref={inputRef}
        id={id}
        name={name}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        maxLength={maxLength}
        required
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value)
          setShowAll(false)
          setActive(-1)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        className={cn('h-11 text-base', options.length > 0 && 'pr-11')}
      />
      {options.length > 0 ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Hide existing event names' : 'Show existing event names'}
          aria-expanded={expanded}
          aria-controls={listId}
          onMouseDown={(event) => event.preventDefault()} // keep focus in the input
          onClick={toggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn('size-5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        hidden={!expanded}
        onMouseDown={(event) => event.preventDefault()} // keep focus in the input (also when dragging the scrollbar)
        className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {visible.map((option, index) => {
          const selected = option.toLocaleLowerCase() === query
          return (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onClick={() => select(option)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2.5 text-base',
                index === active && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="truncate">{option}</span>
              {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
