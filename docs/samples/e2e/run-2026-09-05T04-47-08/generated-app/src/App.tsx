import { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } from "@apollo/client";
import { CarList } from "./components/CarList";

const client = new ApolloClient({
  ssrMode: typeof window === "undefined",
  link: new HttpLink({
    uri: process.env.REACT_APP_GRAPHQL_URL || "http://localhost:4000/graphql",
    credentials: "same-origin",
  }),
  cache: new InMemoryCache(),
});

export function App() {
  return (
    <ApolloProvider client={client}>
      <div className="App">
        <h1>Car Inventory Manager</h1>
        <CarList />
      </div>
    </ApolloProvider>
  );
}

export default App;
