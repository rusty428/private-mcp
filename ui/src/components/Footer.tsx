import Box from '@cloudscape-design/components/box';

export default function Footer() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '12px 0',
      borderTop: '1px solid var(--color-border-control-default, #414d5c)',
      backgroundColor: 'var(--color-background-home-header, #0f1b2a)',
    }}>
      <Box fontSize="body-s">
        <span style={{ color: '#ffffff' }}>
          Made with &#10084; in Seattle &middot;{' '}
          <a
            href="https://github.com/rusty428/private-mcp"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            GitHub
          </a>
        </span>
      </Box>
    </div>
  );
}
