/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'
import { Highlight, themes, type PrismTheme, type Token } from 'prism-react-renderer'
import type { Key } from 'react'
import { CopyButton } from './CopyButton'

interface CodeBlockProps {
  code: string
  language: string
  showCopy?: boolean
  codeAreaClassName?: string
  className?: string
}

interface HighlightProps {
  style: React.CSSProperties
  tokens: Token[][]
  getLineProps: (props: { line: Token[]; key: number }) => React.HTMLAttributes<HTMLDivElement>
  getTokenProps: (props: { token: Token; key: number }) => React.HTMLAttributes<HTMLSpanElement>
}

const oneDark = {
  ...themes.oneDark,
  plain: {
    ...themes.oneDark.plain,
    background: 'hsl(var(--code-background))',
  },
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, showCopy = true, codeAreaClassName, className }) => {
  const { resolvedTheme } = useTheme()

  return (
    <div className={cn('relative rounded-lg', className)}>
      <Highlight
        theme={(resolvedTheme === 'dark' ? oneDark : themes.oneLight) as PrismTheme}
        code={code.trim()}
        language={language}
      >
        {({ style, tokens, getLineProps, getTokenProps }: HighlightProps) => (
          <pre className={cn('p-4 rounded-lg overflow-x-auto', codeAreaClassName)} style={style}>
            {tokens.map((line, i) => {
              const props = getLineProps({ line, key: i })
              const { key: lineKey, ...rest } = props as typeof props & { key?: Key }
              return (
                <div key={lineKey ?? i} {...rest}>
                  {line.map((token, key) => {
                    const tokenProps = getTokenProps({ token, key })
                    const { key: tokenKey, ...restTokenProps } = tokenProps as typeof tokenProps & { key?: Key }
                    return <span key={tokenKey ?? key} {...restTokenProps} />
                  })}
                </div>
              )
            })}
          </pre>
        )}
      </Highlight>
      {showCopy && (
        <CopyButton
          value={code.trim()}
          variant="ghost"
          className="absolute text-muted-foreground right-2 top-2.5 p-2"
        />
      )}
    </div>
  )
}

export default CodeBlock
