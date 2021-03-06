const React = require(`react`);
const { useMoreInfoQuery } = require("./src/hooks/use-more-info-query");
const Github = require(`./src/components/github`).default;
const PostBodyComponents = require(`./src/components/post-body-components-ssr`)
  .default;

exports.onRenderBody = ({ setPostBodyComponents }) => {
  setPostBodyComponents(PostBodyComponents);
};

exports.wrapRootElement = ({ element }) => (
  <>
    <Github />
    {element}
  </>
);

function PageWrapper({ children }) {
  const data = useMoreInfoQuery();
  return (
    <>
      <h1>{data.site.siteMetadata.moreInfo}</h1>
      {children}
    </>
  );
}

exports.wrapPageElement = ({ element }) => <PageWrapper>{element}</PageWrapper>;
